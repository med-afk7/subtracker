import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  smallserial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// All moments are timestamptz (stored in UTC); calendar dates use `date` (see docs §2)
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Normalized (trimmed, lowercased) by the app; the check makes that an invariant
    email: text('email').notNull().unique(),
    // Null for accounts that only sign in with Google (they can add a password by resetting it)
    passwordHash: text('password_hash'),
    // IANA timezone name, validated by the app; decides what "today" means for this user
    timezone: text('timezone').notNull().default('UTC'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    remindersEnabled: boolean('reminders_enabled').notNull().default(true),
    defaultReminderDaysBefore: smallint('default_reminder_days_before').notNull().default(3),
    ...timestamps,
  },
  (table) => [
    check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check(
      'users_default_reminder_days_range',
      sql`${table.defaultReminderDaysBefore} between 0 and 30`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 of the session token. The raw token only exists in the user's cookie,
    // so a leaked database can't be used to log in.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // "Log out everywhere" deletes by user; cleanup deletes by expiry
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const emailTokenPurposeEnum = pgEnum('email_token_purpose', [
  'verify_email',
  'reset_password',
]);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurposeEnum('purpose').notNull(),
    // SHA-256 of the token; the raw token only appears in the emailed link
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('email_tokens_user_purpose_idx').on(table.userId, table.purpose)],
);

// Sign-in through an outside provider. The provider's stable user id (`subject`), not the email,
// identifies the person: an email address can change hands, the subject never does.
export const authProviderEnum = pgEnum('auth_provider', ['google']);

export const authIdentities = pgTable(
  'auth_identities',
  {
    provider: authProviderEnum('provider').notNull(),
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.subject] }),
    // One identity per provider per user
    uniqueIndex('auth_identities_user_provider_idx').on(table.userId, table.provider),
  ],
);

// Reference data: a fixed list seeded by a migration (custom categories may come later)
export const categories = pgTable('categories', {
  id: smallserial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

// week | month | year plus a count: quarterly = (month, 3), annually = (year, 1).
// New frequencies (every 2 weeks, every 6 months) need no code changes.
export const billingIntervalEnum = pgEnum('billing_interval', ['week', 'month', 'year']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'cancelled']);
// default: use the account-wide setting; custom: use reminder_days_before; off: never remind
export const reminderModeEnum = pgEnum('reminder_mode', ['default', 'custom', 'off']);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    // Which known service this is (e.g. "netflix"), set when created from a preset; the frontend
    // shows that service's logo. NULL for custom subscriptions.
    service: varchar('service', { length: 40 }),
    categoryId: smallint('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    // Current price in the currency's minor units (cents), copied from the latest price point
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    billingInterval: billingIntervalEnum('billing_interval').notNull(),
    billingIntervalCount: smallint('billing_interval_count').notNull().default(1),
    startDate: date('start_date').notNull(),
    // Source of truth for the schedule: occurrence k = anchor + k intervals (docs §4.2)
    billingAnchorDate: date('billing_anchor_date').notNull(),
    // Cached next occurrence, for sorting in SQL. NULL when no future charge is expected.
    nextBillingDate: date('next_billing_date'),
    endDate: date('end_date'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    reminderMode: reminderModeEnum('reminder_mode').notNull().default('default'),
    reminderDaysBefore: smallint('reminder_days_before'),
    // Optional free-text label only, e.g. "Visa ending 1234". Never card numbers.
    paymentMethodLabel: varchar('payment_method_label', { length: 50 }),
    providerWebsite: text('provider_website'),
    cancellationUrl: text('cancellation_url'),
    ...timestamps,
  },
  (table) => [
    // Covers the user's list sorted by next billing date and "upcoming payments"
    index('subscriptions_user_next_billing_idx').on(table.userId, table.nextBillingDate),
    // The reminder scheduler scans active subscriptions across all users by next billing date
    index('subscriptions_active_next_billing_idx')
      .on(table.nextBillingDate)
      .where(sql`${table.status} = 'active'`),
    check('subscriptions_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check('subscriptions_service_format', sql`${table.service} ~ '^[a-z0-9][a-z0-9-]*$'`),
    check('subscriptions_amount_non_negative', sql`${table.amountMinor} >= 0`),
    check('subscriptions_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'subscriptions_interval_count_range',
      sql`${table.billingIntervalCount} between 1 and 52`,
    ),
    check(
      'subscriptions_anchor_after_start',
      sql`${table.billingAnchorDate} >= ${table.startDate}`,
    ),
    check(
      'subscriptions_end_after_start',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    // A cancelled subscription always records when; an active one never has that timestamp
    check(
      'subscriptions_cancelled_at_matches_status',
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
    // Only cancelled subscriptions can be archived (docs §4.1)
    check(
      'subscriptions_archive_requires_cancelled',
      sql`${table.archivedAt} is null or ${table.status} = 'cancelled'`,
    ),
    check(
      'subscriptions_reminder_days_matches_mode',
      sql`(${table.reminderMode} = 'custom') = (${table.reminderDaysBefore} is not null)`,
    ),
    check(
      'subscriptions_reminder_days_range',
      sql`${table.reminderDaysBefore} is null or ${table.reminderDaysBefore} between 0 and 30`,
    ),
  ],
);

export const priceChangeSourceEnum = pgEnum('price_change_source', ['initial', 'manual_update']);

// Append-only price history. Old -> new is derived with LAG() rather than stored, so it can't
// drift out of sync when a back-dated change is inserted between existing points (docs §3).
export const subscriptionPrices = pgTable(
  'subscription_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    // When the price applied (business time)...
    effectiveDate: date('effective_date').notNull(),
    // ...and when the app learned about it (system time)
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    source: priceChangeSourceEnum('source').notNull(),
  },
  (table) => [
    index('subscription_prices_timeline_idx').on(
      table.subscriptionId,
      table.effectiveDate,
      table.recordedAt,
    ),
    check('subscription_prices_amount_non_negative', sql`${table.amountMinor} >= 0`),
    check('subscription_prices_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const notificationKindEnum = pgEnum('notification_kind', ['upcoming_charge']);
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending', // due, waiting for a worker
  'sending', // claimed by a worker (lease until locked_until)
  'retrying', // a temporary failure; tried again at next_attempt_at
  'sent', // accepted by the email provider
  'failed', // permanent failure or out of attempts
  'skipped', // no longer valid when its turn came (e.g. subscription cancelled)
]);

// The reminder queue and its delivery log in one table (docs §6). A row is created only when a
// reminder becomes due, and claimed by workers with FOR UPDATE SKIP LOCKED.
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    // Also the email provider's idempotency key, so a retried send can't produce a second email
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull().default('upcoming_charge'),
    // The charge this reminder is about
    billingDate: date('billing_date').notNull(),
    daysBefore: smallint('days_before').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    status: deliveryStatusEnum('status').notNull().default('pending'),
    attemptCount: smallint('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    ...timestamps,
  },
  (table) => [
    // Idempotency: at most one reminder per charge, however often the scheduler runs
    uniqueIndex('notification_deliveries_one_per_charge').on(
      table.subscriptionId,
      table.billingDate,
      table.kind,
    ),
    // The dispatcher's "what's claimable now?" query
    index('notification_deliveries_claimable_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('pending', 'retrying', 'sending')`),
    check('notification_deliveries_days_before_range', sql`${table.daysBefore} between 0 and 30`),
  ],
);

export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;

export type AuthProvider = (typeof authProviderEnum.enumValues)[number];
export type UserRow = typeof users.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type EmailTokenPurpose = (typeof emailTokenPurposeEnum.enumValues)[number];
