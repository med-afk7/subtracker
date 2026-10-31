import { describe, expect, it } from 'vitest';
import {
  nextOccurrenceOnOrAfter,
  nextOccurrences,
  occurrenceAt,
  occurrencesBetween,
  describeFrequency,
  type Schedule,
} from '../../src/domain/recurrence.js';

const schedule = (overrides: Partial<Schedule>): Schedule => ({
  anchor: '2026-01-31',
  interval: 'month',
  count: 1,
  ...overrides,
});

describe('month-end and leap-year rules', () => {
  it('a Jan 31 monthly schedule clamps to the month end and returns to the 31st', () => {
    expect(nextOccurrences(schedule({}), '2026-01-31', 5)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('a Feb 29 annual schedule bills Feb 28 in common years and Feb 29 in leap years', () => {
    const leap = schedule({ anchor: '2028-02-29', interval: 'year' });
    expect(nextOccurrences(leap, '2028-01-01', 5)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('a quarterly schedule from Nov 30 keeps the 30th where it exists', () => {
    const quarterly = schedule({ anchor: '2026-11-30', count: 3 });
    expect(nextOccurrences(quarterly, '2026-11-30', 4)).toEqual([
      '2026-11-30',
      '2027-02-28',
      '2027-05-30',
      '2027-08-30',
    ]);
  });

  it('weekly schedules step exactly 7 days, across month and year boundaries', () => {
    const weekly = schedule({ anchor: '2026-12-24', interval: 'week' });
    expect(nextOccurrences(weekly, '2026-12-25', 3)).toEqual([
      '2026-12-31',
      '2027-01-07',
      '2027-01-14',
    ]);
    const biweekly = { ...weekly, count: 2 };
    expect(nextOccurrences(biweekly, '2026-12-25', 2)).toEqual(['2027-01-07', '2027-01-21']);
  });
});

describe('next occurrence on or after a date', () => {
  const monthly = schedule({});

  it.each([
    ['2026-10-30', '2026-10-31'], // later this month
    ['2026-10-31', '2026-10-31'], // today counts
    ['2026-11-01', '2026-11-30'], // just missed: next month, clamped
    ['2036-07-15', '2036-07-31'], // far in the future, computed directly
  ])('from %s -> %s', (from, expected) => {
    expect(nextOccurrenceOnOrAfter(monthly, from)).toBe(expected);
  });

  it('begins at the anchor: no charges are invented between the start date and the anchor', () => {
    // Started Jan 10 and the user said the next bill is Mar 15: Jan 15 and Feb 15 don't exist
    const s = schedule({ anchor: '2027-03-15' });
    expect(nextOccurrenceOnOrAfter(s, '2026-10-31')).toBe('2027-03-15');
    expect(nextOccurrences(s, '2027-01-01', 2)).toEqual(['2027-03-15', '2027-04-15']);
  });

  it('counts whole steps from the anchor, never from the previous occurrence', () => {
    const s = schedule({});
    expect(occurrenceAt(s, 1)).toBe('2026-02-28');
    expect(occurrenceAt(s, 2)).toBe('2026-03-31'); // not Mar 28
  });

  it('stops at the end date (an occurrence on the end date still counts)', () => {
    const ending = schedule({ endDate: '2026-12-31' });
    expect(nextOccurrences(ending, '2026-10-01', 10)).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);
    expect(nextOccurrenceOnOrAfter(ending, '2027-01-01')).toBeNull();
  });
});

describe('occurrencesBetween', () => {
  const monthly = schedule({});

  it('includes both ends of the range', () => {
    expect(occurrencesBetween(monthly, '2026-03-31', '2026-05-31')).toEqual([
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('returns nothing before the anchor', () => {
    expect(
      occurrencesBetween(schedule({ anchor: '2026-06-15' }), '2026-01-01', '2026-06-14'),
    ).toEqual([]);
    expect(
      occurrencesBetween(schedule({ anchor: '2026-06-15' }), '2026-01-01', '2026-07-31'),
    ).toEqual(['2026-06-15', '2026-07-15']);
  });

  it('stops at the end date', () => {
    const ending = schedule({ endDate: '2026-04-30' });
    expect(occurrencesBetween(ending, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('handles February in leap and common years across a long range', () => {
    const yearly = schedule({ anchor: '2028-02-29', interval: 'year' });
    expect(occurrencesBetween(yearly, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('steps weekly schedules exactly, including every-2-weeks', () => {
    const biweekly = schedule({ anchor: '2026-12-24', interval: 'week', count: 2 });
    expect(occurrencesBetween(biweekly, '2026-12-25', '2027-02-01')).toEqual([
      '2027-01-07',
      '2027-01-21',
    ]);
  });

  it('is empty for a range with no billing day or an inverted range', () => {
    expect(occurrencesBetween(monthly, '2026-04-01', '2026-04-29')).toEqual([]);
    expect(occurrencesBetween(monthly, '2026-05-01', '2026-04-01')).toEqual([]);
  });

  it('jumps straight to a far-future range', () => {
    expect(occurrencesBetween(monthly, '2099-02-01', '2099-03-31')).toEqual([
      '2099-02-28',
      '2099-03-31',
    ]);
  });
});

describe('describeFrequency', () => {
  it.each([
    ['week', 1, 'weekly'],
    ['week', 2, 'every 2 weeks'],
    ['month', 1, 'monthly'],
    ['month', 3, 'quarterly'],
    ['month', 6, 'every 6 months'],
    ['year', 1, 'annually'],
  ] as const)('%s x %d = %s', (interval, count, expected) => {
    expect(describeFrequency(interval, count)).toBe(expected);
  });
});
