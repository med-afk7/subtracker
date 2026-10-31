import { describe, expect, it } from 'vitest';
import type { Schedule } from '../../src/domain/recurrence.js';
import {
  MAX_ATTEMPTS,
  backoffMs,
  dueReminders,
  effectiveDaysBefore,
  reminderTime,
} from '../../src/domain/reminders.js';

const user = { remindersEnabled: true, emailVerifiedAt: new Date(), defaultReminderDaysBefore: 3 };
const sub = {
  status: 'active' as const,
  archivedAt: null,
  reminderMode: 'default' as const,
  reminderDaysBefore: null,
};

describe('effectiveDaysBefore', () => {
  it('uses the account default, or the subscription’s custom value', () => {
    expect(effectiveDaysBefore(user, sub)).toBe(3);
    expect(
      effectiveDaysBefore(user, { ...sub, reminderMode: 'custom', reminderDaysBefore: 0 }),
    ).toBe(0);
  });

  it.each([
    ['reminders turned off for the account', { ...user, remindersEnabled: false }, sub],
    ['unverified email', { ...user, emailVerifiedAt: null }, sub],
    ['subscription set to off', user, { ...sub, reminderMode: 'off' as const }],
    ['cancelled subscription', user, { ...sub, status: 'cancelled' as const }],
    [
      'archived subscription',
      user,
      { ...sub, status: 'cancelled' as const, archivedAt: new Date() },
    ],
  ])('none for %s', (_case, u, s) => {
    expect(effectiveDaysBefore(u, s)).toBeNull();
  });
});

describe('reminderTime', () => {
  it('is 09:00 local time the given number of days before the charge', () => {
    expect(reminderTime('2026-11-10', 3, 'America/Los_Angeles').toISOString()).toBe(
      '2026-11-07T17:00:00.000Z',
    );
    expect(reminderTime('2026-11-10', 0, 'UTC').toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });
});

describe('dueReminders', () => {
  const monthly: Schedule = { anchor: '2026-11-10', interval: 'month', count: 1 };
  const due = (now: string, schedule = monthly, days = 3, tz = 'UTC') =>
    dueReminders(schedule, days, tz, new Date(now)).map((r) => r.billingDate);

  it('is not due before 09:00 on the reminder day', () => {
    expect(due('2026-11-07T08:59:59Z')).toEqual([]);
  });

  it('is due from 09:00 on the reminder day', () => {
    expect(due('2026-11-07T09:00:00Z')).toEqual(['2026-11-10']);
  });

  it('is still due if the worker was down, as long as the charge is ahead', () => {
    expect(due('2026-11-09T23:00:00Z')).toEqual(['2026-11-10']);
    expect(due('2026-11-10T20:00:00Z')).toEqual(['2026-11-10']); // charge day itself
  });

  it('is never due once the charge date has passed', () => {
    expect(due('2026-11-11T00:00:01Z')).toEqual([]);
  });

  it('uses the user’s timezone for both the send time and "has the charge passed"', () => {
    // 09:00 in Los Angeles on Nov 7 is 17:00 UTC
    expect(due('2026-11-07T16:59:00Z', monthly, 3, 'America/Los_Angeles')).toEqual([]);
    expect(due('2026-11-07T17:00:00Z', monthly, 3, 'America/Los_Angeles')).toEqual(['2026-11-10']);
    // 03:00 UTC on Nov 11 is still Nov 10 in Los Angeles: the charge hasn't passed there
    expect(due('2026-11-11T03:00:00Z', monthly, 3, 'America/Los_Angeles')).toEqual(['2026-11-10']);
  });

  it('finds every charge whose reminder is due when the lead time exceeds the interval', () => {
    const weekly: Schedule = { anchor: '2026-11-02', interval: 'week', count: 1 };
    // 10 days ahead of a weekly plan: on Nov 3 both Nov 9's and (from 09:00) Nov 13's... reminders exist
    expect(due('2026-11-03T09:00:00Z', weekly, 10)).toEqual(['2026-11-09']);
    expect(due('2026-11-06T09:00:00Z', weekly, 10)).toEqual(['2026-11-09', '2026-11-16']);
  });
});

describe('backoffMs', () => {
  it('waits longer after each failure, within ±20% jitter', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5].map((a) => backoffMs(a, mid))).toEqual([
      60_000, 300_000, 1_800_000, 7_200_000, 21_600_000,
    ]);
    expect(backoffMs(1, () => 0)).toBe(48_000);
    expect(backoffMs(1, () => 1)).toBe(72_000);
  });

  it('allows five attempts, all inside the provider’s 24-hour idempotency window', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    const worstCase = [1, 2, 3, 4].reduce((sum, a) => sum + backoffMs(a, () => 1), 0);
    expect(worstCase).toBeLessThan(24 * 3_600_000);
  });
});
