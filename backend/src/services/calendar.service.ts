import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { categories, subscriptionPrices, subscriptions } from '../db/schema.js';
import { formatAmount } from '../domain/money.js';
import { addDays, todayIn, type PlainDate } from '../domain/plainDate.js';
import { priceOn, type PricePoint } from '../domain/priceHistory.js';
import { occurrencesBetween } from '../domain/recurrence.js';
import type { CalendarQuery } from '../http/schemas/calendar.schemas.js';
import type { RequestContext } from './subscriptions.service.js';

export interface CalendarEventDto {
  date: PlainDate;
  subscriptionId: string;
  name: string;
  service: string | null;
  category: { slug: string; name: string };
  amount: string;
  currency: string;
  // Always "expected": calculated from the schedule, never a confirmed transaction
  status: 'expected';
  isPast: boolean;
}

// Expected charges from `from` to `to` (inclusive), priced in minor units: past ones at the
// price that applied then, upcoming ones at today's price. Shared by the calendar and the
// forecast so both come from the same recurrence engine and rules.
export async function listExpectedCharges(ctx: RequestContext, query: CalendarQuery) {
  const today = todayIn(ctx.timezone);

  // Archived subscriptions are hidden everywhere, including the calendar
  const conditions: SQL[] = [
    eq(subscriptions.userId, ctx.userId),
    isNull(subscriptions.archivedAt),
  ];
  if (query.subscriptionId) conditions.push(eq(subscriptions.id, query.subscriptionId));
  if (query.category) conditions.push(eq(categories.slug, query.category));

  const rows = await db
    .select({ sub: subscriptions, category: categories })
    .from(subscriptions)
    .innerJoin(categories, eq(categories.id, subscriptions.categoryId))
    .where(and(...conditions));

  // One query for every subscription's price history (not one per subscription)
  const ids = rows.map(({ sub }) => sub.id);
  const pointsBySubscription = new Map<string, PricePoint[]>();
  if (ids.length > 0) {
    const points = await db
      .select()
      .from(subscriptionPrices)
      .where(inArray(subscriptionPrices.subscriptionId, ids));
    for (const p of points) {
      const list = pointsBySubscription.get(p.subscriptionId) ?? [];
      list.push(p);
      pointsBySubscription.set(p.subscriptionId, list);
    }
  }

  // Built with integer minor units; formatted to decimal strings only at the end
  const events = rows.flatMap(({ sub, category }) => {
    // A cancelled subscription only had charges before the day it was cancelled
    let endDate = sub.endDate;
    if (sub.status === 'cancelled' && sub.cancelledAt) {
      const lastBeforeCancel = addDays(todayIn(ctx.timezone, sub.cancelledAt), -1);
      if (!endDate || lastBeforeCancel < endDate) endDate = lastBeforeCancel;
    }
    const dates = occurrencesBetween(
      {
        anchor: sub.billingAnchorDate,
        interval: sub.billingInterval,
        count: sub.billingIntervalCount,
        endDate,
      },
      query.from,
      query.to,
    );

    const points = pointsBySubscription.get(sub.id) ?? [];
    return dates.map((date) => {
      const isPast = date < today;
      // Past charges use the price that applied then; upcoming ones use today's price
      const price = (isPast && priceOn(points, date)) || {
        amountMinor: sub.amountMinor,
        currency: sub.currency,
      };
      return {
        date,
        sub,
        category,
        amountMinor: price.amountMinor,
        currency: price.currency,
        isPast,
      };
    });
  });
  events.sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));
  return events;
}

export async function getCalendar(ctx: RequestContext, query: CalendarQuery) {
  const events = await listExpectedCharges(ctx, query);

  // Exact integer sums per currency; currencies are never combined
  const totals = new Map<string, { minor: number; count: number }>();
  for (const event of events) {
    const entry = totals.get(event.currency) ?? { minor: 0, count: 0 };
    entry.minor += event.amountMinor;
    entry.count += 1;
    totals.set(event.currency, entry);
  }

  return {
    from: query.from,
    to: query.to,
    events: events.map((e): CalendarEventDto => ({
      date: e.date,
      subscriptionId: e.sub.id,
      name: e.sub.name,
      service: e.sub.service,
      category: { slug: e.category.slug, name: e.category.name },
      amount: formatAmount(e.amountMinor, e.currency),
      currency: e.currency,
      status: 'expected',
      isPast: e.isPast,
    })),
    totals: [...totals].map(([currency, { minor, count }]) => ({
      currency,
      amount: formatAmount(minor, currency),
      count,
    })),
  };
}
