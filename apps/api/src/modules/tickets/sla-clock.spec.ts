import { describe, expect, it } from 'vitest';
import { DEFAULT_SUPPORT_SETTINGS, type BusinessHours } from '@foxindex/validation';
import { addBusinessMinutes, businessMinutesBetween, slaDue, slaSummary } from './sla-clock';

/** Sunday–Thursday 09:00–18:00 Asia/Dhaka (UTC+6, no DST). 2026-10-11 is a Sunday. */
const dhaka: BusinessHours = DEFAULT_SUPPORT_SETTINGS.businessHours;
const at = (iso: string) => new Date(iso);

describe('addBusinessMinutes', () => {
  it('adds within the same working day', () => {
    expect(addBusinessMinutes(at('2026-10-11T04:00:00Z'), 60, dhaka).toISOString()).toBe('2026-10-11T05:00:00.000Z');
  });

  it('carries over the weekend (Friday + Saturday off)', () => {
    // Thu 17:30 Dhaka + 60 min → 30 min Thursday, 30 min Sunday from 09:00.
    expect(addBusinessMinutes(at('2026-10-15T11:30:00Z'), 60, dhaka).toISOString()).toBe('2026-10-18T03:30:00.000Z');
  });

  it('starts the clock at the next opening when created off-hours', () => {
    // Friday 14:00 Dhaka → clock starts Sunday 09:00.
    expect(addBusinessMinutes(at('2026-10-16T08:00:00Z'), 15, dhaka).toISOString()).toBe('2026-10-18T03:15:00.000Z');
  });

  it('skips holidays', () => {
    const hours = { ...dhaka, holidays: ['2026-10-18'] };
    expect(addBusinessMinutes(at('2026-10-15T11:30:00Z'), 60, hours).toISOString()).toBe('2026-10-19T03:30:00.000Z');
  });

  it('is DST-aware (New York, spring forward on 2026-03-08)', () => {
    const ny: BusinessHours = {
      timezone: 'America/New_York',
      days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: d >= 1 && d <= 5, start: '09:00', end: '17:00' })),
      holidays: [],
    };
    // Fri 16:00 EST (21:00Z) + 120 → 60 Friday, then Monday 09:00 EDT (13:00Z) + 60.
    expect(addBusinessMinutes(at('2026-03-06T21:00:00Z'), 120, ny).toISOString()).toBe('2026-03-09T14:00:00.000Z');
  });

  it('falls back to calendar time when no day is open', () => {
    const closed = { ...dhaka, days: dhaka.days.map((d) => ({ ...d, open: false })) };
    expect(addBusinessMinutes(at('2026-10-11T04:00:00Z'), 90, closed).toISOString()).toBe('2026-10-11T05:30:00.000Z');
  });
});

describe('businessMinutesBetween', () => {
  it('counts only working time', () => {
    // Thu 17:00 → Sun 10:00 Dhaka = 60 + 60.
    expect(businessMinutesBetween(at('2026-10-15T11:00:00Z'), at('2026-10-18T04:00:00Z'), dhaka)).toBe(120);
  });

  it('round-trips with addBusinessMinutes', () => {
    const start = at('2026-10-14T10:17:00Z');
    const due = addBusinessMinutes(start, 1234, dhaka);
    expect(businessMinutesBetween(start, due, dhaka)).toBe(1234);
  });

  it('is zero for reversed ranges', () => {
    expect(businessMinutesBetween(at('2026-10-12T05:00:00Z'), at('2026-10-12T04:00:00Z'), dhaka)).toBe(0);
  });
});

describe('slaDue', () => {
  it('runs 24/7 when the target ignores business hours', () => {
    expect(slaDue(at('2026-10-16T08:00:00Z'), 30, { businessHours: false }, dhaka).toISOString()).toBe('2026-10-16T08:30:00.000Z');
  });
});

describe('slaSummary', () => {
  const base = {
    status: 'open' as const,
    createdAt: at('2026-10-11T04:00:00Z'),
    firstResponseAt: null,
    firstResponseDueAt: at('2026-10-11T05:00:00Z'),
    resolutionDueAt: at('2026-10-12T04:00:00Z'),
    slaPausedAt: null,
  };

  it('tracks first response, then resolution', () => {
    expect(slaSummary(base, at('2026-10-11T04:10:00Z'), 80)).toMatchObject({ target: 'first_response', state: 'ok' });
    expect(slaSummary({ ...base, firstResponseAt: at('2026-10-11T04:20:00Z') }, at('2026-10-11T04:30:00Z'), 80)).toMatchObject({ target: 'resolution', state: 'ok' });
  });

  it('flags at-risk and breached', () => {
    expect(slaSummary(base, at('2026-10-11T04:50:00Z'), 80)?.state).toBe('at_risk');
    expect(slaSummary(base, at('2026-10-11T05:00:00Z'), 80)?.state).toBe('breached');
  });

  it('pauses resolution while waiting on the client and hides done tickets', () => {
    const waiting = { ...base, status: 'waiting_on_client' as const, firstResponseAt: at('2026-10-11T04:20:00Z'), slaPausedAt: at('2026-10-11T04:20:00Z') };
    expect(slaSummary(waiting, at('2026-10-13T00:00:00Z'), 80)?.state).toBe('paused');
    expect(slaSummary({ ...base, status: 'resolved' }, at('2026-10-11T04:10:00Z'), 80)).toBeNull();
  });
});
