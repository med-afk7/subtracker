import { and, asc, desc, eq, ilike, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  categories,
  subscriptionPrices,
  subscriptions,
  users,
  type CategoryRow,
  type SubscriptionRow,
} from '../db/schema.js';
import {
  canApply,
  stateOf,
  transitionError,
  type LifecycleAction,
  type SubscriptionState,
} from '../domain/lifecycle.js';
import { formatAmount, parseAmount } from '../domain/money.js';
import { withPrevious } from '../domain/priceHistory.js';
import { addDays, todayIn, type PlainDate } from '../domain/plainDate.js';
import { nextOccurrenceOnOrAfter, nextOccurrences, type Schedule } from '../domain/recurrence.js';
import type {
  CreateSubscriptionInput,
  ListQuery,
  UpdateSubscriptionInput,
} from '../http/schemas/subscriptions.schemas.js';
import { AppError, businessRule, conflict, notFound } from '../lib/errors.js';
import type { Executor } from './sessions.service.js';

// Who is asking: every query is scoped to this user, and "today" is in their timezone
export interface RequestContext {
  userId: string;
  timezone: string;
}

export interface SubscriptionDto {
  id: string;
  name: string;
  service: string | null;
  category: { slug: string; name: string };
  notes: string | null;
  amount: string;
  currency: string;
  billingInterval: SubscriptionRow['billingInterval'];
  billingIntervalCount: number;
  startDate: PlainDate;
  nextBillingDate: PlainDate | null;
  endDate: PlainDate | null;
  state: SubscriptionState;
  cancelledAt: string | null;
  archivedAt: string | null;
  reminderMode: SubscriptionRow['reminderMode'];
  reminderDaysBefore: number | null;
  paymentMethodLabel: string | null;
  providerWebsite: string | null;
  cancellationUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionDetailsDto extends SubscriptionDto {
  upcomingBillingDates: PlainDate[];
}

const fieldError = (path: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', message, [{ path, message }]);

const scheduleOf = (
  row: Pick<
    SubscriptionRow,
    'billingAnchorDate' | 'billingInterval' | 'billingIntervalCount' | 'endDate'
  >,
): Schedule => ({
  anchor: row.billingAnchorDate,
  interval: row.billingInterval,
  count: row.billingIntervalCount,
  endDate: row.endDate,
});

// Only active, unarchived subscriptions have upcoming charges
function nextBillingDateFor(row: SubscriptionRow, today: PlainDate): PlainDate | null {
  if (stateOf(row) !== 'active') return null;
  return nextOccurrenceOnOrAfter(scheduleOf(row), today);
}

function toDto(row: SubscriptionRow, category: CategoryRow, today: PlainDate): SubscriptionDto {
  return {
    id: row.id,
    name: row.name,
    service: row.service,
    category: { slug: category.slug, name: category.name },
    notes: row.notes,
    amount: formatAmount(row.amountMinor, row.currency),
    currency: row.currency,
    billingInterval: row.billingInterval,
    billingIntervalCount: row.billingIntervalCount,
    startDate: row.startDate,
    // Always freshly computed; the stored column is a cache used for sorting
    nextBillingDate: nextBillingDateFor(row, today),
    endDate: row.endDate,
    state: stateOf(row),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    reminderMode: row.reminderMode,
    reminderDaysBefore: row.reminderDaysBefore,
    paymentMethodLabel: row.paymentMethodLabel,
    providerWebsite: row.providerWebsite,
    cancellationUrl: row.cancellationUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const listCategories = () =>
  db
    .select({ slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(categories.id);

async function categoryBySlug(slug: string, executor: Executor = db): Promise<CategoryRow> {
  const [category] = await executor.select().from(categories).where(eq(categories.slug, slug));
  if (!category) throw fieldError('category', `Unknown category "${slug}"`);
  return category;
}

function toMinorUnits(amount: string, currency: string): number {
  try {
    return parseAmount(amount, currency);
  } catch (err) {
    throw fieldError('amount', (err as Error).message);
  }
}

// One owned subscription with its category, optionally locked for the rest of the transaction
async function findOwned(ctx: RequestContext, id: string, executor: Executor = db, lock = false) {
  const query = executor
    .select({ sub: subscriptions, category: categories })
    .from(subscriptions)
    .innerJoin(categories, eq(categories.id, subscriptions.categoryId))
    // Ownership is part of the WHERE clause: someone else's id simply isn't found
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, ctx.userId)));
  const [row] = await (lock ? query.for('update', { of: subscriptions }) : query);
  if (!row) throw notFound('Subscription');
  return row;
}

// The stored next_billing_date only moves forward when something rewrites it. Bring stale rows
// up to date: for one user before sorting their list, or for everyone in the worker's
// maintenance step. "Today" is each owner's own date.
export async function refreshStaleNextBillingDates(options: { userId?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  // No timezone is more than a day ahead of UTC, so anything before UTC-tomorrow may be stale
  const candidatesBefore = addDays(todayIn('UTC', now), 1);
  const stale = await db
    .select({ sub: subscriptions, timezone: users.timezone })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(
      and(
        options.userId ? eq(subscriptions.userId, options.userId) : undefined,
        eq(subscriptions.status, 'active'),
        lt(subscriptions.nextBillingDate, candidatesBefore),
      ),
    );

  let updated = 0;
  for (const { sub, timezone } of stale) {
    const today = todayIn(timezone, now);
    if (!sub.nextBillingDate || sub.nextBillingDate >= today) continue;
    await db
      .update(subscriptions)
      .set({ nextBillingDate: nextBillingDateFor(sub, today) })
      .where(eq(subscriptions.id, sub.id));
    updated += 1;
  }
  return updated;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function listSubscriptions(ctx: RequestContext, query: ListQuery) {
  const today = todayIn(ctx.timezone);
  await refreshStaleNextBillingDates({ userId: ctx.userId });

  const conditions: (SQL | undefined)[] = [eq(subscriptions.userId, ctx.userId)];
  if (query.state === 'active') conditions.push(eq(subscriptions.status, 'active'));
  if (query.state === 'cancelled') {
    conditions.push(eq(subscriptions.status, 'cancelled'), isNull(subscriptions.archivedAt));
  }
  if (query.state === 'archived') conditions.push(isNotNull(subscriptions.archivedAt));
  if (!query.state) conditions.push(isNull(subscriptions.archivedAt));
  if (query.search) conditions.push(ilike(subscriptions.name, `%${escapeLike(query.search)}%`));
  if (query.category) conditions.push(eq(categories.slug, query.category));
  if (query.interval) conditions.push(eq(subscriptions.billingInterval, query.interval));
  const where = and(...conditions);

  const direction = query.order === 'desc' ? desc : asc;
  const orderBy = {
    // Subscriptions with no upcoming charge go last in either direction
    nextBillingDate: [sql`${subscriptions.nextBillingDate} ${sql.raw(query.order)} nulls last`],
    // Amounts in different currencies aren't comparable, so group by currency first
    amount: [asc(subscriptions.currency), direction(subscriptions.amountMinor)],
    name: [direction(sql`lower(${subscriptions.name})`)],
  }[query.sort];

  const [rows, [totals]] = await Promise.all([
    db
      .select({ sub: subscriptions, category: categories })
      .from(subscriptions)
      .innerJoin(categories, eq(categories.id, subscriptions.categoryId))
      .where(where)
      // The id tie-breaker keeps page boundaries stable when sort values are equal
      .orderBy(...orderBy, asc(subscriptions.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(subscriptions)
      .innerJoin(categories, eq(categories.id, subscriptions.categoryId))
      .where(where),
  ]);

  const total = totals?.total ?? 0;
  return {
    data: rows.map(({ sub, category }) => toDto(sub, category, today)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getSubscription(
  ctx: RequestContext,
  id: string,
): Promise<SubscriptionDetailsDto> {
  const today = todayIn(ctx.timezone);
  const { sub, category } = await findOwned(ctx, id);
  return {
    ...toDto(sub, category, today),
    upcomingBillingDates:
      stateOf(sub) === 'active' ? nextOccurrences(scheduleOf(sub), today, 3) : [],
  };
}

export async function createSubscription(
  ctx: RequestContext,
  input: CreateSubscriptionInput,
): Promise<SubscriptionDto> {
  const today = todayIn(ctx.timezone);
  const amountMinor = toMinorUnits(input.amount, input.currency);

  return db.transaction(async (tx) => {
    const category = await categoryBySlug(input.category, tx);
    const values = {
      userId: ctx.userId,
      name: input.name,
      service: input.service ?? null,
      categoryId: category.id,
      notes: input.notes ?? null,
      amountMinor,
      currency: input.currency,
      billingInterval: input.billingInterval,
      billingIntervalCount: input.billingIntervalCount,
      startDate: input.startDate,
      billingAnchorDate: input.nextBillingDate ?? input.startDate,
      endDate: input.endDate ?? null,
      reminderMode: input.reminderMode,
      reminderDaysBefore:
        input.reminderMode === 'custom' ? (input.reminderDaysBefore ?? null) : null,
      paymentMethodLabel: input.paymentMethodLabel ?? null,
      providerWebsite: input.providerWebsite ?? null,
      cancellationUrl: input.cancellationUrl ?? null,
    };
    const nextBillingDate = nextOccurrenceOnOrAfter(scheduleOf(values), today);

    const [sub] = await tx
      .insert(subscriptions)
      .values({ ...values, nextBillingDate })
      .returning();
    if (!sub) throw new Error('Insert returned no subscription');

    // History starts with the starting price, in the same transaction as the subscription
    await tx.insert(subscriptionPrices).values({
      subscriptionId: sub.id,
      amountMinor,
      currency: input.currency,
      effectiveDate: input.startDate,
      source: 'initial',
    });

    return toDto(sub, category, today);
  });
}

export async function updateSubscription(
  ctx: RequestContext,
  id: string,
  patch: UpdateSubscriptionInput,
): Promise<SubscriptionDto> {
  const today = todayIn(ctx.timezone);

  return db.transaction(async (tx) => {
    // Lock the row: a concurrent edit waits instead of interleaving its price change with ours
    const { sub: current, category: currentCategory } = await findOwned(ctx, id, tx, true);

    const intervalChanged =
      (patch.billingInterval !== undefined && patch.billingInterval !== current.billingInterval) ||
      (patch.billingIntervalCount !== undefined &&
        patch.billingIntervalCount !== current.billingIntervalCount);
    // Switching e.g. monthly -> annually must not silently invent a renewal date
    if (intervalChanged && !patch.nextBillingDate) {
      throw businessRule(
        'NEXT_BILLING_DATE_REQUIRED',
        'Changing how often you’re billed needs the next billing date, so the new schedule starts from a date you confirm',
      );
    }

    const startDate = patch.startDate ?? current.startDate;
    const anchor = patch.nextBillingDate ?? current.billingAnchorDate;
    const endDate = patch.endDate === undefined ? current.endDate : patch.endDate;
    if (anchor < startDate) {
      throw fieldError(
        patch.nextBillingDate ? 'nextBillingDate' : 'startDate',
        'The next billing date can’t be before the start date',
      );
    }
    if (endDate && endDate < startDate)
      throw fieldError('endDate', 'Can’t be before the start date');

    const reminderMode = patch.reminderMode ?? current.reminderMode;
    const reminderDaysBefore =
      reminderMode === 'custom' ? (patch.reminderDaysBefore ?? current.reminderDaysBefore) : null;
    if (reminderMode === 'custom' && reminderDaysBefore === null) {
      throw fieldError('reminderDaysBefore', 'Choose how many days before');
    }

    const category = patch.category ? await categoryBySlug(patch.category, tx) : currentCategory;

    // Price changes are recorded as history, then the current price is re-derived from it
    let { amountMinor, currency } = current;
    const newCurrency = patch.currency ?? current.currency;
    if (patch.currency !== undefined && patch.currency !== current.currency && !patch.amount) {
      throw fieldError('amount', 'Enter the amount in the new currency');
    }
    const newAmount =
      patch.amount !== undefined ? toMinorUnits(patch.amount, newCurrency) : current.amountMinor;
    if (newAmount !== current.amountMinor || newCurrency !== current.currency) {
      const effectiveDate = patch.priceEffectiveDate ?? today;
      if (effectiveDate > today) {
        throw fieldError('priceEffectiveDate', 'Future price changes aren’t supported yet');
      }
      if (effectiveDate < startDate) {
        throw fieldError('priceEffectiveDate', 'Can’t be before the start date');
      }
      await tx.insert(subscriptionPrices).values({
        subscriptionId: id,
        amountMinor: newAmount,
        currency: newCurrency,
        effectiveDate,
        source: 'manual_update',
      });
      // A back-dated change may land before a later one; the latest point is the current price
      const [latest] = await tx
        .select({
          amountMinor: subscriptionPrices.amountMinor,
          currency: subscriptionPrices.currency,
        })
        .from(subscriptionPrices)
        .where(eq(subscriptionPrices.subscriptionId, id))
        .orderBy(desc(subscriptionPrices.effectiveDate), desc(subscriptionPrices.recordedAt))
        .limit(1);
      if (latest) ({ amountMinor, currency } = latest);
    }

    const changes = {
      name: patch.name ?? current.name,
      service: patch.service === undefined ? current.service : patch.service,
      categoryId: category.id,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      amountMinor,
      currency,
      billingInterval: patch.billingInterval ?? current.billingInterval,
      billingIntervalCount: patch.billingIntervalCount ?? current.billingIntervalCount,
      startDate,
      billingAnchorDate: anchor,
      endDate,
      reminderMode,
      reminderDaysBefore,
      paymentMethodLabel:
        patch.paymentMethodLabel === undefined
          ? current.paymentMethodLabel
          : patch.paymentMethodLabel,
      providerWebsite:
        patch.providerWebsite === undefined ? current.providerWebsite : patch.providerWebsite,
      cancellationUrl:
        patch.cancellationUrl === undefined ? current.cancellationUrl : patch.cancellationUrl,
    };
    const nextBillingDate = nextBillingDateFor({ ...current, ...changes }, today);

    const [updated] = await tx
      .update(subscriptions)
      .set({ ...changes, nextBillingDate })
      .where(eq(subscriptions.id, id))
      .returning();
    if (!updated) throw notFound('Subscription');
    return toDto(updated, category, today);
  });
}

export async function deleteSubscription(ctx: RequestContext, id: string): Promise<void> {
  const [row] = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, ctx.userId)))
    .returning({ id: subscriptions.id });
  if (!row) throw notFound('Subscription');
}

export async function applyLifecycleAction(
  ctx: RequestContext,
  id: string,
  action: LifecycleAction,
  options: { endDate?: PlainDate | null; nextBillingDate?: PlainDate } = {},
): Promise<SubscriptionDto> {
  const today = todayIn(ctx.timezone);

  return db.transaction(async (tx) => {
    const { sub, category } = await findOwned(ctx, id, tx, true);
    const state = stateOf(sub);
    if (!canApply(action, state)) throw conflict(transitionError(action, state));

    let changes: Partial<typeof subscriptions.$inferInsert>;
    switch (action) {
      // Records the user's cancellation; the provider is never contacted
      case 'cancel': {
        const endDate = options.endDate === undefined ? sub.endDate : options.endDate;
        if (endDate && endDate < sub.startDate) {
          throw fieldError('endDate', 'Can’t be before the start date');
        }
        changes = { status: 'cancelled', cancelledAt: new Date(), nextBillingDate: null, endDate };
        break;
      }
      // Billing resumes from a date the user confirms, like a fresh schedule
      case 'reactivate': {
        const anchor = options.nextBillingDate;
        if (!anchor) throw fieldError('nextBillingDate', 'Choose the next billing date');
        if (anchor < sub.startDate) {
          throw fieldError('nextBillingDate', 'Can’t be before the start date');
        }
        const resumed = {
          ...sub,
          status: 'active' as const,
          billingAnchorDate: anchor,
          endDate: null,
        };
        changes = {
          status: 'active',
          cancelledAt: null,
          billingAnchorDate: anchor,
          endDate: null,
          nextBillingDate: nextBillingDateFor({ ...resumed, cancelledAt: null }, today),
        };
        break;
      }
      case 'archive':
        changes = { archivedAt: new Date() };
        break;
      case 'unarchive':
        changes = { archivedAt: null };
        break;
    }

    const [updated] = await tx
      .update(subscriptions)
      .set(changes)
      .where(eq(subscriptions.id, id))
      .returning();
    if (!updated) throw notFound('Subscription');
    return toDto(updated, category, today);
  });
}

// Price history, newest first, with each price's predecessor and the change in the same currency
export async function getPriceHistory(ctx: RequestContext, id: string) {
  const { sub } = await findOwned(ctx, id);
  const points = await db
    .select()
    .from(subscriptionPrices)
    .where(eq(subscriptionPrices.subscriptionId, id));

  const difference = (from: { amountMinor: number; currency: string }, to: typeof from) => {
    if (from.currency !== to.currency) return null;
    const diff = to.amountMinor - from.amountMinor;
    return `${diff < 0 ? '-' : '+'}${formatAmount(Math.abs(diff), to.currency)}`;
  };
  const view = (p: { amountMinor: number; currency: string; effectiveDate: string }) => ({
    amount: formatAmount(p.amountMinor, p.currency),
    currency: p.currency,
    effectiveDate: p.effectiveDate,
  });

  const chain = withPrevious(points);
  const first = chain[0];
  const last = chain.at(-1);
  return {
    subscriptionId: sub.id,
    name: sub.name,
    entries: chain
      .map((p) => ({
        ...view(p),
        recordedAt: p.recordedAt.toISOString(),
        source: p.source,
        previousAmount: p.previous
          ? formatAmount(p.previous.amountMinor, p.previous.currency)
          : null,
        difference: p.previous ? difference(p.previous, p) : null,
      }))
      .reverse(),
    // e.g. "from 9.99 in January to 14.99 now: +5.00"
    overall:
      first && last && first !== last
        ? { from: view(first), to: view(last), difference: difference(first, last) }
        : null,
  };
}

// Every subscription the user has (all states), for CSV export
export async function listAllSubscriptions(ctx: RequestContext): Promise<SubscriptionDto[]> {
  const today = todayIn(ctx.timezone);
  const rows = await db
    .select({ sub: subscriptions, category: categories })
    .from(subscriptions)
    .innerJoin(categories, eq(categories.id, subscriptions.categoryId))
    .where(eq(subscriptions.userId, ctx.userId))
    .orderBy(sql`lower(${subscriptions.name})`, asc(subscriptions.id));
  return rows.map(({ sub, category }) => toDto(sub, category, today));
}

// Every price point of the user's subscriptions, oldest first, for CSV export
export async function listAllPriceHistory(ctx: RequestContext) {
  return db
    .select({
      name: subscriptions.name,
      amountMinor: subscriptionPrices.amountMinor,
      currency: subscriptionPrices.currency,
      effectiveDate: subscriptionPrices.effectiveDate,
      recordedAt: subscriptionPrices.recordedAt,
      source: subscriptionPrices.source,
    })
    .from(subscriptionPrices)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionPrices.subscriptionId))
    .where(eq(subscriptions.userId, ctx.userId))
    .orderBy(
      sql`lower(${subscriptions.name})`,
      asc(subscriptionPrices.effectiveDate),
      asc(subscriptionPrices.recordedAt),
    );
}
