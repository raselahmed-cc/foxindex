import type { BusinessHours, SlaTarget, TicketStatus } from '@foxindex/validation';

/**
 * Business-hours arithmetic for SLA targets. Pure functions over UTC instants;
 * the support team's schedule is expressed in its own IANA timezone (DST-safe
 * via Intl), with per-weekday windows and holiday dates.
 */

const MINUTE = 60_000;
const MAX_DAYS = 800;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatters.set(tz, f);
  }
  return f;
}

function localParts(tz: string, instant: number) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(instant)).map((x) => [x.type, Number(x.value)])) as Record<string, number>;
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Milliseconds the zone is ahead of UTC at this instant. */
function offsetAt(tz: string, instant: number): number {
  const p = localParts(tz, instant);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant / 1000) * 1000;
}

/** UTC instant for a local wall-clock time (minutes after local midnight) on a local date. */
function localToUtc(tz: string, y: number, m: number, d: number, minuteOfDay: number): number {
  const wall = Date.UTC(y, m - 1, d) + minuteOfDay * MINUTE;
  const guess = wall - offsetAt(tz, wall);
  return wall - offsetAt(tz, guess);
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const isoDate = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Open windows (UTC ms) for consecutive local days starting at the day containing `from`. */
function* windows(hours: BusinessHours, from: number): Generator<[number, number]> {
  const start = localParts(hours.timezone, from);
  const holidays = new Set(hours.holidays);
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const rule = hours.days[day.getUTCDay()];
    if (!rule?.open || holidays.has(isoDate(y, m, d))) continue;
    yield [localToUtc(hours.timezone, y, m, d, toMinutes(rule.start)), localToUtc(hours.timezone, y, m, d, toMinutes(rule.end))];
  }
}

const hasOpenDays = (hours: BusinessHours) => hours.days.some((d) => d.open);

/** `start` plus `minutes` of working time. Falls back to calendar time if no day is open. */
export function addBusinessMinutes(start: Date, minutes: number, hours: BusinessHours): Date {
  if (!hasOpenDays(hours)) return new Date(start.getTime() + minutes * MINUTE);
  let remaining = minutes * MINUTE;
  const cursor = start.getTime();
  for (const [ws, we] of windows(hours, cursor)) {
    const from = Math.max(cursor, ws);
    if (from >= we) continue;
    if (remaining <= we - from) return new Date(from + remaining);
    remaining -= we - from;
  }
  return new Date(cursor + minutes * MINUTE);
}

/** Working minutes between two instants (0 if `to` is not after `from`). */
export function businessMinutesBetween(from: Date, to: Date, hours: BusinessHours): number {
  const a = from.getTime();
  const b = to.getTime();
  if (b <= a) return 0;
  if (!hasOpenDays(hours)) return (b - a) / MINUTE;
  let total = 0;
  for (const [ws, we] of windows(hours, a)) {
    if (ws >= b) break;
    total += Math.max(0, Math.min(we, b) - Math.max(ws, a));
  }
  return total / MINUTE;
}

/** Due instant for an SLA target, honouring its business-hours flag. */
export function slaDue(start: Date, minutes: number, target: Pick<SlaTarget, 'businessHours'>, hours: BusinessHours): Date {
  return target.businessHours ? addBusinessMinutes(start, minutes, hours) : new Date(start.getTime() + minutes * MINUTE);
}

/** Remaining SLA time between two instants, measured the same way the target counts. */
export function slaRemaining(from: Date, due: Date, target: Pick<SlaTarget, 'businessHours'>, hours: BusinessHours): number {
  return target.businessHours ? businessMinutesBetween(from, due, hours) : Math.max(0, (due.getTime() - from.getTime()) / MINUTE);
}

// ── SLA state for display / filtering ─────────────────────────────────────

/** Statuses where the resolution clock is stopped. */
export const SLA_PAUSED_STATUSES: TicketStatus[] = ['waiting_on_client', 'resolved', 'closed'];

export type SlaState = 'ok' | 'at_risk' | 'breached' | 'paused';

export interface SlaFields {
  status: TicketStatus;
  createdAt: Date;
  firstResponseAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  slaPausedAt: Date | null;
}

export interface SlaSummary {
  /** Which target the agent should look at right now. */
  target: 'first_response' | 'resolution';
  dueAt: Date;
  state: SlaState;
}

/**
 * The SLA an agent cares about now: first response until it happens, then
 * resolution. "At risk" once `warnPercent` of the window has elapsed.
 */
export function slaSummary(t: SlaFields, now: Date, warnPercent: number): SlaSummary | null {
  if (t.status === 'resolved' || t.status === 'closed') return null;
  const target = !t.firstResponseAt && t.firstResponseDueAt ? 'first_response' : 'resolution';
  const dueAt = target === 'first_response' ? t.firstResponseDueAt : t.resolutionDueAt;
  if (!dueAt) return null;
  if (target === 'resolution' && t.slaPausedAt) return { target, dueAt, state: 'paused' };
  if (now >= dueAt) return { target, dueAt, state: 'breached' };
  const warnAt = t.createdAt.getTime() + ((dueAt.getTime() - t.createdAt.getTime()) * warnPercent) / 100;
  return { target, dueAt, state: now.getTime() >= warnAt ? 'at_risk' : 'ok' };
}
