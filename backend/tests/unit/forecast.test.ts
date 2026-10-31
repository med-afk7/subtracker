import { describe, expect, it } from 'vitest';
import { forecastByMonth, monthsBetween, type ForecastPayment } from '../../src/domain/forecast.js';

const pay = (date: string, amountMinor: number, currency = 'USD', name = 'X'): ForecastPayment => ({
  date,
  subscriptionId: name,
  name,
  amountMinor,
  currency,
});

describe('monthsBetween', () => {
  it('lists every month the range touches, across a year boundary', () => {
    expect(monthsBetween('2026-10-20', '2027-01-18')).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });

  it('is a single month for a range inside one month', () => {
    expect(monthsBetween('2026-10-01', '2026-10-31')).toEqual(['2026-10']);
  });
});

describe('forecastByMonth', () => {
  it('puts an annual payment entirely in its renewal month (unlike the monthly equivalent)', () => {
    const payments = [
      pay('2026-11-03', 1599, 'USD', 'Netflix'),
      pay('2026-12-03', 1599, 'USD', 'Netflix'),
      pay('2026-12-15', 12000, 'USD', 'Domain'),
    ];
    expect(forecastByMonth(payments, ['2026-11', '2026-12', '2027-01'])).toEqual([
      { month: '2026-11', totals: [{ currency: 'USD', amount: '15.99', count: 1 }] },
      { month: '2026-12', totals: [{ currency: 'USD', amount: '135.99', count: 2 }] },
      { month: '2027-01', totals: [] },
    ]);
  });

  it('keeps currencies apart and sums exactly', () => {
    const payments = [
      pay('2026-11-01', 10, 'USD'),
      pay('2026-11-02', 20, 'USD'),
      pay('2026-11-05', 1500, 'JPY'),
    ];
    // 0.10 + 0.20 is exactly 0.30 here: integer minor units, no floating point
    expect(forecastByMonth(payments, ['2026-11'])[0]!.totals).toEqual([
      { currency: 'USD', amount: '0.30', count: 2 },
      { currency: 'JPY', amount: '1500', count: 1 },
    ]);
  });

  it('ignores payments outside the listed months', () => {
    expect(forecastByMonth([pay('2027-05-01', 100)], ['2026-11'])).toEqual([
      { month: '2026-11', totals: [] },
    ]);
  });
});
