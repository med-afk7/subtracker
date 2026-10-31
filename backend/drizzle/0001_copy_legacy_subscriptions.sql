-- Phase 3b replaces the subscriptions table. Keep a copy of the old rows so migration 0004 can
-- convert them into the new model. Enum columns are copied as text so the old enum types can be
-- dropped in the next migration.
CREATE TABLE "legacy_subscriptions" AS
SELECT
  "id",
  "user_id",
  "name",
  "price",
  "start_date",
  "billing_cycle"::text AS "billing_cycle",
  "is_active",
  "notify_by"::text AS "notify_by",
  "remind_days_before",
  "created_at"
FROM "subscriptions";
