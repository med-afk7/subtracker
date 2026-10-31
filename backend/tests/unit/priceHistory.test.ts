import { describe, expect, it } from 'vitest';
import { priceOn, withPrevious, type PricePoint } from '../../src/domain/priceHistory.js';

const point = (
  amountMinor: number,
  effectiveDate: string,
  recordedAt = '2026-01-01T00:00:00Z',
): PricePoint => ({
  amountMinor,
  currency: 'USD',
  effectiveDate,
  recordedAt: new Date(recordedAt),
});

describe('priceOn', () => {
  // Inserted out of order on purpose: a back-dated change recorded last
  const history = [
    point(999, '2026-01-15'),
    point(1499, '2026-10-01'),
    point(1299, '2026-06-01', '2026-10-20T00:00:00Z'),
  ];

  it.each([
    ['2026-01-15', 999], // the day it starts
    ['2026-05-31', 999],
    ['2026-06-01', 1299], // the back-dated change applies from its effective date
    ['2026-09-30', 1299],
    ['2026-10-01', 1499],
    ['2099-01-01', 1499],
  ])('on %s -> %d', (date, expected) => {
    expect(priceOn(history, date)?.amountMinor).toBe(expected);
  });

  it('uses the earliest known price before the first point', () => {
    expect(priceOn(history, '2025-12-01')?.amountMinor).toBe(999);
  });

  it('lets a later correction win on the same effective date', () => {
    const corrected = [
      point(1000, '2026-03-01', '2026-03-01T00:00:00Z'),
      point(1100, '2026-03-01', '2026-03-05T00:00:00Z'),
    ];
    expect(priceOn(corrected, '2026-03-10')?.amountMinor).toBe(1100);
  });

  it('is undefined with no history', () => {
    expect(priceOn([], '2026-01-01')).toBeUndefined();
  });
});

describe('withPrevious', () => {
  it('orders by effective date and pairs each price with the one before', () => {
    const history = [
      point(1499, '2026-10-01'),
      point(999, '2026-01-15'),
      point(1299, '2026-06-01', '2026-10-20T00:00:00Z'),
    ];
    expect(
      withPrevious(history).map((p) => [p.amountMinor, p.previous?.amountMinor ?? null]),
    ).toEqual([
      [999, null],
      [1299, 999],
      [1499, 1299],
    ]);
  });
});
