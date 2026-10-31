import { describe, expect, it } from 'vitest';
import type { PricePoint } from '../../src/domain/priceHistory.js';
import {
  monthlySnapshotDates,
  spendingTrend,
  type TrendSubscription,
} from '../../src/domain/trends.js';

const price = (amountMinor: number, effectiveDate: string, currency = 'USD'): PricePoint => ({
  amountMinor,
  currency,
  effectiveDate,
  recordedAt: new Date('2026-01-01T00:00:00Z'),
});
const sub = (overrides: Partial<TrendSubscription>): TrendSubscription => ({
  startDate: '2026-01-15',
  endDate: null,
  cancelledOn: null,
  interval: 'month',
  count: 1,
  prices: [price(1000, '2026-01-15')],
  ...overrides,
});
const monthly = (points: ReturnType<typeof spendingTrend>) =>
  points.map((p) => [
    p.month,
    p.totals.map((t) => `${t.monthlyMinor} ${t.currency}`).join(' + ') || '-',
  ]);

describe('monthlySnapshotDates', () => {
  it('takes month ends, and today for the current month', () => {
    expect(monthlySnapshotDates('2026-01-20', '2026-04-10')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-10',
    ]);
  });

  it('handles a leap February and a year boundary', () => {
    expect(monthlySnapshotDates('2027-12-05', '2028-03-01')).toEqual([
      '2027-12-31',
      '2028-01-31',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('spendingTrend', () => {
  const dates = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'];

  it('follows price changes from their effective date', () => {
    const s = sub({ prices: [price(1000, '2026-01-15'), price(1300, '2026-03-10')] });
    expect(monthly(spendingTrend([s], dates))).toEqual([
      ['2026-01', '1000 USD'],
      ['2026-02', '1000 USD'],
      ['2026-03', '1300 USD'],
      ['2026-04', '1300 USD'],
      ['2026-05', '1300 USD'],
    ]);
  });

  it('counts a subscription only from its start date until it ends or is cancelled', () => {
    const late = sub({ startDate: '2026-03-05', prices: [price(500, '2026-03-05')] });
    const cancelled = sub({ cancelledOn: '2026-04-01' });
    const fixedTerm = sub({ endDate: '2026-02-28', prices: [price(200, '2026-01-15')] });
    expect(monthly(spendingTrend([late, cancelled, fixedTerm], dates))).toEqual([
      ['2026-01', '1200 USD'], // cancelled + fixed term
      ['2026-02', '1200 USD'], // fixed term still active on its end date
      ['2026-03', '1500 USD'], // late starter joins, fixed term gone
      ['2026-04', '500 USD'], // cancelled on Apr 1: gone by Apr 30
      ['2026-05', '500 USD'],
    ]);
  });

  it('normalizes each interval and keeps currencies apart', () => {
    const yearly = sub({ interval: 'year', prices: [price(12000, '2026-01-15')] });
    const weekly = sub({ interval: 'week', prices: [price(1000, '2026-01-15', 'CAD')] });
    expect(monthly(spendingTrend([yearly, weekly], ['2026-01-31']))).toEqual([
      ['2026-01', '1000 USD + 4333 CAD'],
    ]);
  });

  it('shows nothing before anything started', () => {
    expect(monthly(spendingTrend([sub({})], ['2025-12-31']))).toEqual([['2025-12', '-']]);
  });
});
