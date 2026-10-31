-- Predefined categories
INSERT INTO "categories" ("slug", "name") VALUES
  ('entertainment', 'Entertainment'),
  ('productivity', 'Productivity'),
  ('health-fitness', 'Health and fitness'),
  ('cloud-services', 'Cloud services'),
  ('education', 'Education'),
  ('utilities', 'Utilities'),
  ('other', 'Other');
--> statement-breakpoint

-- Convert subscriptions from the pre-3b model (copied in 0001):
--   price numeric(10,2) USD   -> amount_minor in cents, currency USD
--   monthly / yearly          -> (month, 1) / (year, 1), anchored on the start date
--   is_active = false         -> cancelled now
--   notify_by email / none    -> custom reminder with the same days / reminders off
-- next_billing_date is the first anchor + k intervals on or after today. Postgres adds months
-- with month-end clamping from the anchor, the same rule as the app's recurrence engine.
INSERT INTO "subscriptions" (
  "user_id", "name", "category_id", "amount_minor", "currency",
  "billing_interval", "billing_interval_count", "start_date", "billing_anchor_date",
  "next_billing_date", "status", "cancelled_at", "reminder_mode", "reminder_days_before",
  "created_at", "updated_at"
)
SELECT
  l."user_id",
  l."name",
  (SELECT "id" FROM "categories" WHERE "slug" = 'other'),
  round(l."price" * 100)::bigint,
  'USD',
  (CASE l."billing_cycle" WHEN 'yearly' THEN 'year' ELSE 'month' END)::"billing_interval",
  1,
  l."start_date",
  l."start_date",
  CASE WHEN l."is_active" THEN (
    SELECT (l."start_date" + make_interval(months => k * CASE l."billing_cycle" WHEN 'yearly' THEN 12 ELSE 1 END))::date
    FROM generate_series(0, 1200) AS k
    WHERE (l."start_date" + make_interval(months => k * CASE l."billing_cycle" WHEN 'yearly' THEN 12 ELSE 1 END))::date >= current_date
    ORDER BY k
    LIMIT 1
  ) END,
  (CASE WHEN l."is_active" THEN 'active' ELSE 'cancelled' END)::"subscription_status",
  CASE WHEN l."is_active" THEN NULL ELSE now() END,
  (CASE l."notify_by" WHEN 'email' THEN 'custom' ELSE 'off' END)::"reminder_mode",
  CASE l."notify_by" WHEN 'email' THEN least(greatest(l."remind_days_before", 0), 30) END,
  l."created_at",
  now()
FROM "legacy_subscriptions" AS l;
--> statement-breakpoint

-- Every subscription starts its price history with its starting price
INSERT INTO "subscription_prices" ("subscription_id", "amount_minor", "currency", "effective_date", "source")
SELECT "id", "amount_minor", "currency", "start_date", 'initial'
FROM "subscriptions";
--> statement-breakpoint

DROP TABLE "legacy_subscriptions";
