import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  isPlainDate,
  todayIn,
  zonedTimeToUtc,
} from '../../src/domain/plainDate.js';

describe('addMonthsClamped', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'], // clamp to February
    ['2028-01-31', 1, '2028-02-29'], // leap year
    ['2026-01-31', 2, '2026-03-31'], // computed from the original day, not the clamped one
    ['2026-03-31', -1, '2026-02-28'], // backwards
    ['2026-11-30', 3, '2027-02-28'], // across a year boundary
    ['2026-05-15', -17, '2024-12-15'],
    ['2024-02-29', 12, '2025-02-28'],
  ])('%s %+d months = %s', (date, months, expected) => {
    expect(addMonthsClamped(date, months)).toBe(expected);
  });
});

describe('day arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
    expect(daysBetween('2026-03-10', '2026-03-01')).toBe(-9);
  });
});

describe('isPlainDate', () => {
  it.each(['2026-02-28', '2028-02-29'])('accepts %s', (d) => expect(isPlainDate(d)).toBe(true));
  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '2026-01-31T00:00', ''])('rejects %j', (d) =>
    expect(isPlainDate(d)).toBe(false),
  );
});

describe('todayIn', () => {
  // 2026-11-01 05:30 UTC: already Nov 1 in London and Tokyo, still Oct 31 in Vancouver
  const now = new Date('2026-11-01T05:30:00Z');
  it.each([
    ['UTC', '2026-11-01'],
    ['Europe/London', '2026-11-01'],
    ['Asia/Tokyo', '2026-11-01'],
    ['America/Vancouver', '2026-10-31'],
  ])('%s -> %s', (timezone, expected) => {
    expect(todayIn(timezone, now)).toBe(expected);
  });
});

describe('zonedTimeToUtc', () => {
  it.each([
    // [date, timezone, expected instant for 09:00 local]
    ['2026-11-03', 'UTC', '2026-11-03T09:00:00.000Z'],
    ['2026-11-03', 'America/Vancouver', '2026-11-03T17:00:00.000Z'], // PST, UTC-8
    ['2026-07-03', 'America/Vancouver', '2026-07-03T16:00:00.000Z'], // PDT, UTC-7
    ['2026-03-08', 'America/Vancouver', '2026-03-08T16:00:00.000Z'], // spring-forward day, after 2am
    ['2026-03-07', 'America/Vancouver', '2026-03-07T17:00:00.000Z'], // the day before
    ['2026-10-25', 'Europe/London', '2026-10-25T09:00:00.000Z'], // back to GMT that morning
    ['2026-10-24', 'Europe/London', '2026-10-24T08:00:00.000Z'], // still BST
    ['2026-11-03', 'Asia/Kolkata', '2026-11-03T03:30:00.000Z'], // half-hour offset
    ['2026-11-03', 'Pacific/Kiritimati', '2026-11-02T19:00:00.000Z'], // UTC+14: previous UTC day
  ])('09:00 on %s in %s = %s', (date, timezone, expected) => {
    expect(zonedTimeToUtc(date, 9, timezone).toISOString()).toBe(expected);
  });

  it('moves a wall time skipped by a spring-forward to just after the gap', () => {
    // 02:00 doesn't exist in Vancouver on 2026-03-08 (clocks jump from 02:00 to 03:00)
    expect(zonedTimeToUtc('2026-03-08', 2, 'America/Vancouver').toISOString()).toBe(
      '2026-03-08T10:00:00.000Z', // = 03:00 PDT
    );
  });
});

describe('zonedTimeToUtc on a fall-back day', () => {
  it('resolves a repeated wall time to the earlier instant', () => {
    // 01:00 happens twice in Vancouver on 2026-11-01; the first is still PDT (UTC-7)
    expect(zonedTimeToUtc('2026-11-01', 1, 'America/Vancouver').toISOString()).toBe(
      '2026-11-01T08:00:00.000Z',
    );
  });
});
