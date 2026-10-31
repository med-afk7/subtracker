import { describe, expect, it } from 'vitest';
import {
  currencyExponent,
  formatAmount,
  isValidCurrency,
  parseAmount,
  paymentsPerYear,
  totalsByCurrency,
} from '../../src/domain/money.js';

describe('currencies', () => {
  it('knows each currency’s minor units', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('BHD')).toBe(3);
  });

  it.each(['USD', 'CAD', 'EUR', 'JPY'])('accepts %s', (c) => expect(isValidCurrency(c)).toBe(true));
  it.each(['usd', 'XYZ', 'US', ''])('rejects %j', (c) => expect(isValidCurrency(c)).toBe(false));
});

describe('parseAmount', () => {
  it.each([
    ['15.99', 'USD', 1599],
    ['15.9', 'USD', 1590],
    ['15', 'USD', 1500],
    ['0', 'USD', 0],
    ['1500', 'JPY', 1500],
    ['1.250', 'BHD', 1250],
    ['0.10', 'USD', 10], // 0.1 + 0.2 style float errors can't happen: digits are joined as text
  ] as const)('%s %s -> %d', (amount, currency, expected) => {
    expect(parseAmount(amount, currency)).toBe(expected);
  });

  it('rejects more decimals than the currency has instead of rounding', () => {
    expect(() => parseAmount('15.999', 'USD')).toThrow(/at most 2 decimal/);
    expect(() => parseAmount('1500.5', 'JPY')).toThrow(/can't have decimals/);
  });

  it.each(['-5', '1e3', '12,50', 'abc', '', '.5'])('rejects %j', (amount) => {
    expect(() => parseAmount(amount, 'USD')).toThrow();
  });
});

describe('formatAmount', () => {
  it.each([
    [1599, 'USD', '15.99'],
    [5, 'USD', '0.05'],
    [1500, 'JPY', '1500'],
    [1250, 'BHD', '1.250'],
  ] as const)('%d %s -> %s', (minor, currency, expected) => {
    expect(formatAmount(minor, currency)).toBe(expected);
  });
});

describe('recurring cost totals', () => {
  const cost = (
    amountMinor: number,
    interval: 'week' | 'month' | 'year',
    count = 1,
    currency = 'USD',
  ) => ({
    amountMinor,
    currency,
    interval,
    count,
  });
  const only = (costs: Parameters<typeof totalsByCurrency>[0]) => {
    const [total] = totalsByCurrency(costs);
    return { monthly: total?.monthlyMinor, annual: total?.annualMinor };
  };

  it.each([
    // [description, cost, monthly-equivalent, annualized]
    ['monthly: the price itself', cost(1599, 'month'), 1599, 19188],
    ['annual: price / 12', cost(12000, 'year'), 1000, 12000],
    ['quarterly: price / 3', cost(3000, 'month', 3), 1000, 12000],
    ['weekly: price x 52 / 12', cost(100, 'week'), 433, 5200], // 433.33 rounds down
    ['every 2 weeks', cost(1000, 'week', 2), 2167, 26000], // 2166.67 rounds up
    ['every 2 years', cost(24000, 'year', 2), 1000, 12000],
  ] as const)('%s', (_name, c, monthly, annual) => {
    expect(only([c])).toEqual({ monthly, annual });
  });

  it('rounds once at the end: three weekly 1.00 plans are exactly 13.00 a month', () => {
    expect(only([cost(100, 'week'), cost(100, 'week'), cost(100, 'week')]).monthly).toBe(1300);
  });

  it('rounds half up', () => {
    expect(only([cost(6, 'year')]).monthly).toBe(1); // 0.5 cents -> 1 cent
    expect(only([cost(5, 'year')]).monthly).toBe(0); // 0.4166 cents -> 0
  });

  it('uses whole units for zero-decimal currencies', () => {
    expect(totalsByCurrency([cost(1000, 'week', 1, 'JPY')])).toEqual([
      { currency: 'JPY', subscriptionCount: 1, monthlyMinor: 4333, annualMinor: 52000 },
    ]);
  });

  it('never adds different currencies together', () => {
    const totals = totalsByCurrency([
      cost(1599, 'month', 1, 'USD'),
      cost(2999, 'year', 1, 'CAD'),
      cost(1000, 'month', 1, 'USD'),
    ]);
    expect(totals).toEqual([
      { currency: 'USD', subscriptionCount: 2, monthlyMinor: 2599, annualMinor: 31188 },
      { currency: 'CAD', subscriptionCount: 1, monthlyMinor: 250, annualMinor: 2999 },
    ]);
  });

  it('stays exact for large amounts', () => {
    // 90 trillion minor units a week: far past where floating-point loses cents
    expect(only([cost(90_000_000_000_000, 'week')]).annual).toBe(4_680_000_000_000_000);
  });

  it('returns nothing for no subscriptions', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });

  it('knows the payments per year', () => {
    expect(paymentsPerYear('week', 2)).toEqual({ num: 52n, den: 2n });
    expect(paymentsPerYear('month', 3)).toEqual({ num: 12n, den: 3n });
  });
});
