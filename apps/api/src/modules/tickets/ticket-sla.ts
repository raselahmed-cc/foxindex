import type { SupportSettings, TicketPriority, TicketStatus } from '@foxindex/validation';
import { SLA_PAUSED_STATUSES, slaDue, slaRemaining } from './sla-clock';

/**
 * How SLA fields change when a ticket is created, re-prioritised or moves
 * between statuses. Pure — callers spread the returned patch into their update.
 *
 * Resolution due = createdAt + (policy minutes + minutes spent paused), so it
 * can always be recomputed exactly (e.g. after a priority change).
 */

export interface SlaRow {
  priority: string;
  status: TicketStatus;
  createdAt: Date;
  firstResponseAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedMinutes: number;
}

export interface SlaPatch {
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  slaPausedAt?: Date | null;
  slaPausedMinutes?: number;
  firstResponseWarnedAt?: Date | null;
  firstResponseBreachedAt?: Date | null;
  resolutionWarnedAt?: Date | null;
  resolutionBreachedAt?: Date | null;
}

const policy = (settings: SupportSettings, priority: string) => settings.sla[(priority in settings.sla ? priority : 'normal') as TicketPriority];

/** Targets for a brand-new ticket. */
export function initialSla(priority: string, createdAt: Date, settings: SupportSettings): SlaPatch {
  const p = policy(settings, priority);
  const hours = settings.businessHours;
  return {
    firstResponseDueAt: slaDue(createdAt, p.firstResponseMinutes, p, hours),
    resolutionDueAt: slaDue(createdAt, p.resolutionMinutes, p, hours),
  };
}

/** Recompute both targets after a priority change; clears warnings/breaches that no longer apply. */
export function reprioritiseSla(row: SlaRow, priority: string, settings: SupportSettings, now: Date): SlaPatch {
  const p = policy(settings, priority);
  const hours = settings.businessHours;
  const patch: SlaPatch = {
    resolutionDueAt: slaDue(row.createdAt, p.resolutionMinutes + row.slaPausedMinutes, p, hours),
  };
  if (!row.firstResponseAt) patch.firstResponseDueAt = slaDue(row.createdAt, p.firstResponseMinutes, p, hours);
  if (patch.firstResponseDueAt && patch.firstResponseDueAt > now) Object.assign(patch, { firstResponseWarnedAt: null, firstResponseBreachedAt: null });
  if (patch.resolutionDueAt! > now) Object.assign(patch, { resolutionWarnedAt: null, resolutionBreachedAt: null });
  return patch;
}

/** Pause the resolution clock on entering waiting/resolved/closed; resume (and push the due date) on leaving. */
export function statusSla(row: SlaRow, next: TicketStatus, settings: SupportSettings, now: Date): SlaPatch {
  const pausedNext = SLA_PAUSED_STATUSES.includes(next);
  if (pausedNext && !row.slaPausedAt) return { slaPausedAt: now };
  if (!pausedNext && row.slaPausedAt) {
    const p = policy(settings, row.priority);
    const pausedMinutes = row.slaPausedMinutes + Math.round(slaRemaining(row.slaPausedAt, now, p, settings.businessHours));
    const resolutionDueAt = slaDue(row.createdAt, p.resolutionMinutes + pausedMinutes, p, settings.businessHours);
    return {
      slaPausedAt: null,
      slaPausedMinutes: pausedMinutes,
      resolutionDueAt,
      ...(resolutionDueAt > now ? { resolutionWarnedAt: null, resolutionBreachedAt: null } : {}),
    };
  }
  return {};
}
