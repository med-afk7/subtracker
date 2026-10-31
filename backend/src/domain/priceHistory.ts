import type { PlainDate } from './plainDate.js';

export interface PricePoint {
  amountMinor: number;
  currency: string;
  effectiveDate: PlainDate;
  recordedAt: Date;
}

// The price that applied on `date`: the latest point that had taken effect by then. Two points
// with the same effective date are ordered by when they were recorded (the later correction
// wins). A date before the first point gets the first price, the earliest we know of.
export function priceOn(points: PricePoint[], date: PlainDate): PricePoint | undefined {
  let current: PricePoint | undefined;
  for (const point of points) {
    if (point.effectiveDate > date) continue;
    if (
      !current ||
      point.effectiveDate > current.effectiveDate ||
      (point.effectiveDate === current.effectiveDate && point.recordedAt > current.recordedAt)
    ) {
      current = point;
    }
  }
  return (
    current ??
    points.reduce<PricePoint | undefined>(
      (earliest, p) => (!earliest || p.effectiveDate < earliest.effectiveDate ? p : earliest),
      undefined,
    )
  );
}

// Each point paired with the one before it in effective-date order (same-day entries by when
// they were recorded). Derived on read, so a back-dated entry slots in between correctly.
export function withPrevious<T extends PricePoint>(points: T[]): (T & { previous: T | null })[] {
  const ordered = [...points].sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
  return ordered.map((point, i) => ({ ...point, previous: ordered[i - 1] ?? null }));
}
