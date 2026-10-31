import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { categories, subscriptionPrices, subscriptions } from '../db/schema.js';
import { formatAmount, totalsByCurrency, type RecurringCost } from '../domain/money.js';
import { addDays, addMonthsClamped, todayIn, type PlainDate } from '../domain/plainDate.js';
import type { PricePoint } from '../domain/priceHistory.js';
import { occurrencesBetween } from '../domain/recurrence.js';
import { monthlySnapshotDates, spendingTrend } from '../domain/trends.js';
import type { RequestContext } from './subscriptions.service.js';

export const UPCOMING_WINDOW_DAYS = 30;
const RECENT_PRICE_CHANGE_DAYS = 90;

export interface CurrencyTotalDto {
  currency: string;
  subscriptionCount: number;
  monthlyEquivalent: string;
  // An estimate from current prices, not what will be charged in the next calendar year
  annualized: string;
}

export interface UpcomingPaymentDto {
  subscriptionId: string;
  name: string;
  date: PlainDate;
  amount: string;
  currency: string;
  // Always "expected": these come from the schedule, never from a confirmed transaction
  status: 'expected';
}

export interface PriceChangeDto {
  subscriptionId: string;
  name: string;
  effectiveDate: PlainDate;
  previousAmount: string;
  newAmount: string;
  currency: string;
  // Only when both prices are in the same currency, e.g. "+2.00"
  difference: string | null;
}

// Active, unarchived subscriptions are the only ones that cost anything going forward
async function activeSubscriptions(userId: string) {
  return db
    .select({ sub: subscriptions, category: categories })
    .from(subscriptions)
    .innerJoin(categories, eq(categories.id, subscriptions.categoryId))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
        isNull(subscriptions.archivedAt),
      ),
    );
}

const toCost = (sub: typeof subscriptions.$inferSelect): RecurringCost => ({
  amountMinor: sub.amountMinor,
  currency: sub.currency,
  interval: sub.billingInterval,
  count: sub.billingIntervalCount,
});

const toTotalDto = (total: ReturnType<typeof totalsByCurrency>[number]): CurrencyTotalDto => ({
  currency: total.currency,
  subscriptionCount: total.subscriptionCount,
  monthlyEquivalent: formatAmount(total.monthlyMinor, total.currency),
  annualized: formatAmount(total.annualMinor, total.currency),
});

// Most-used currency first
const byCount = (a: { subscriptionCount: number }, b: { subscriptionCount: number }) =>
  b.subscriptionCount - a.subscriptionCount;

function formatDifference(previousMinor: number, newMinor: number, currency: string) {
  const diff = newMinor - previousMinor;
  return `${diff < 0 ? '-' : '+'}${formatAmount(Math.abs(diff), currency)}`;
}

async function recentPriceChanges(userId: string, today: PlainDate): Promise<PriceChangeDto[]> {
  const since = addDays(today, -RECENT_PRICE_CHANGE_DAYS);
  // LAG() pairs every price point with the one before it on the same subscription, ordered by
  // when each price took effect, so back-dated entries still get the right "previous" price
  const result = await db.execute<{
    subscription_id: string;
    name: string;
    effective_date: string;
    amount_minor: string;
    currency: string;
    previous_amount_minor: string;
    previous_currency: string;
  }>(sql`
    WITH timeline AS (
      SELECT
        p.subscription_id,
        s.name,
        p.effective_date,
        p.recorded_at,
        p.amount_minor,
        p.currency,
        p.source,
        LAG(p.amount_minor) OVER w AS previous_amount_minor,
        LAG(p.currency) OVER w AS previous_currency
      FROM subscription_prices p
      JOIN subscriptions s ON s.id = p.subscription_id
      WHERE s.user_id = ${userId} AND s.archived_at IS NULL
      WINDOW w AS (PARTITION BY p.subscription_id ORDER BY p.effective_date, p.recorded_at)
    )
    SELECT subscription_id, name, effective_date::text, amount_minor, currency,
           previous_amount_minor, previous_currency
    FROM timeline
    WHERE source = 'manual_update'
      AND previous_amount_minor IS NOT NULL
      AND effective_date >= ${since}
    ORDER BY effective_date DESC, recorded_at DESC
    LIMIT 5
  `);

  return result.rows.map((row) => {
    const sameCurrency = row.currency === row.previous_currency;
    return {
      subscriptionId: row.subscription_id,
      name: row.name,
      effectiveDate: row.effective_date,
      previousAmount: formatAmount(Number(row.previous_amount_minor), row.previous_currency),
      newAmount: formatAmount(Number(row.amount_minor), row.currency),
      currency: row.currency,
      difference: sameCurrency
        ? formatDifference(
            Number(row.previous_amount_minor),
            Number(row.amount_minor),
            row.currency,
          )
        : null,
    };
  });
}

export async function getSummary(ctx: RequestContext) {
  const today = todayIn(ctx.timezone);
  const until = addDays(today, UPCOMING_WINDOW_DAYS);
  const rows = await activeSubscriptions(ctx.userId);

  // Every expected charge in the window (a weekly plan contributes several)
  const upcoming: UpcomingPaymentDto[] = rows
    .flatMap(({ sub }) =>
      occurrencesBetween(
        {
          anchor: sub.billingAnchorDate,
          interval: sub.billingInterval,
          count: sub.billingIntervalCount,
          endDate: sub.endDate,
        },
        today,
        until,
      ).map((date) => ({
        subscriptionId: sub.id,
        name: sub.name,
        date,
        amount: formatAmount(sub.amountMinor, sub.currency),
        currency: sub.currency,
        status: 'expected' as const,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  return {
    activeCount: rows.length,
    totals: totalsByCurrency(rows.map(({ sub }) => toCost(sub)))
      .map(toTotalDto)
      .sort(byCount),
    upcoming,
    upcomingWindowDays: UPCOMING_WINDOW_DAYS,
    recentPriceChanges: await recentPriceChanges(ctx.userId, today),
  };
}

// Monthly-equivalent spend per category, separately for each currency, largest first
export async function getCategoryBreakdown(ctx: RequestContext) {
  const rows = await activeSubscriptions(ctx.userId);

  const byCurrency = new Map<string, typeof rows>();
  for (const row of rows) {
    byCurrency.set(row.sub.currency, [...(byCurrency.get(row.sub.currency) ?? []), row]);
  }

  return [...byCurrency]
    .map(([currency, currencyRows]) => {
      const byCategory = new Map<string, typeof rows>();
      for (const row of currencyRows) {
        byCategory.set(row.category.slug, [...(byCategory.get(row.category.slug) ?? []), row]);
      }
      const categoryTotals = [...byCategory].map(([slug, categoryRows]) => {
        const [total] = totalsByCurrency(categoryRows.map(({ sub }) => toCost(sub)));
        return {
          slug,
          name: categoryRows[0]!.category.name,
          subscriptionCount: categoryRows.length,
          monthlyMinor: total!.monthlyMinor,
        };
      });
      const [currencyTotal] = totalsByCurrency(currencyRows.map(({ sub }) => toCost(sub)));
      return {
        currency,
        subscriptionCount: currencyRows.length,
        monthlyEquivalent: formatAmount(currencyTotal!.monthlyMinor, currency),
        categories: categoryTotals
          .sort((a, b) => b.monthlyMinor - a.monthlyMinor || a.name.localeCompare(b.name))
          .map(({ monthlyMinor, ...rest }) => ({
            ...rest,
            monthlyEquivalent: formatAmount(monthlyMinor, currency),
            // Share of this currency's total, for the bar length; display only
            share: currencyTotal!.monthlyMinor ? monthlyMinor / currencyTotal!.monthlyMinor : 0,
          })),
      };
    })
    .sort(byCount);
}

// Recorded monthly-equivalent cost at the end of each of the last `months` months, rebuilt from
// start dates, cancellations and price history. Includes archived subscriptions (their past
// cost was real); deleted ones are gone. Starts at the first month anything was active.
export async function getSpendingTrends(ctx: RequestContext, months: number) {
  const today = todayIn(ctx.timezone);
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.userId));
  if (rows.length === 0) return { points: [], months };

  const pricesBySubscription = new Map<string, PricePoint[]>();
  const points = await db
    .select()
    .from(subscriptionPrices)
    .where(
      inArray(
        subscriptionPrices.subscriptionId,
        rows.map((r) => r.id),
      ),
    );
  for (const p of points) {
    pricesBySubscription.set(p.subscriptionId, [
      ...(pricesBySubscription.get(p.subscriptionId) ?? []),
      p,
    ]);
  }

  const earliestStart = rows.reduce((min, r) => (r.startDate < min ? r.startDate : min), today);
  const windowStart = addMonthsClamped(`${today.slice(0, 7)}-01`, -(months - 1));
  const firstMonth = earliestStart > windowStart ? earliestStart : windowStart;
  if (firstMonth > today) return { points: [], months };

  const trend = spendingTrend(
    rows.map((r) => ({
      startDate: r.startDate,
      endDate: r.endDate,
      cancelledOn:
        r.status === 'cancelled' && r.cancelledAt ? todayIn(ctx.timezone, r.cancelledAt) : null,
      interval: r.billingInterval,
      count: r.billingIntervalCount,
      prices: pricesBySubscription.get(r.id) ?? [],
    })),
    monthlySnapshotDates(firstMonth, today),
  );

  return {
    months,
    points: trend.map((p) => ({
      month: p.month,
      date: p.date,
      totals: p.totals.map((t) => ({
        currency: t.currency,
        subscriptionCount: t.subscriptionCount,
        monthlyEquivalent: formatAmount(t.monthlyMinor, t.currency),
      })),
    })),
  };
}
