CREATE TYPE "public"."billing_interval" AS ENUM('week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."price_change_source" AS ENUM('initial', 'manual_update');--> statement-breakpoint
CREATE TYPE "public"."reminder_mode" AS ENUM('default', 'custom', 'off');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"effective_date" date NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "price_change_source" NOT NULL,
	CONSTRAINT "subscription_prices_amount_non_negative" CHECK ("subscription_prices"."amount_minor" >= 0),
	CONSTRAINT "subscription_prices_currency_format" CHECK ("subscription_prices"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"category_id" smallint NOT NULL,
	"notes" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"billing_interval" "billing_interval" NOT NULL,
	"billing_interval_count" smallint DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"billing_anchor_date" date NOT NULL,
	"next_billing_date" date,
	"end_date" date,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"reminder_mode" "reminder_mode" DEFAULT 'default' NOT NULL,
	"reminder_days_before" smallint,
	"payment_method_label" varchar(50),
	"provider_website" text,
	"cancellation_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_name_not_blank" CHECK (btrim("subscriptions"."name") <> ''),
	CONSTRAINT "subscriptions_amount_non_negative" CHECK ("subscriptions"."amount_minor" >= 0),
	CONSTRAINT "subscriptions_currency_format" CHECK ("subscriptions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "subscriptions_interval_count_range" CHECK ("subscriptions"."billing_interval_count" between 1 and 52),
	CONSTRAINT "subscriptions_anchor_after_start" CHECK ("subscriptions"."billing_anchor_date" >= "subscriptions"."start_date"),
	CONSTRAINT "subscriptions_end_after_start" CHECK ("subscriptions"."end_date" is null or "subscriptions"."end_date" >= "subscriptions"."start_date"),
	CONSTRAINT "subscriptions_cancelled_at_matches_status" CHECK (("subscriptions"."status" = 'cancelled') = ("subscriptions"."cancelled_at" is not null)),
	CONSTRAINT "subscriptions_archive_requires_cancelled" CHECK ("subscriptions"."archived_at" is null or "subscriptions"."status" = 'cancelled'),
	CONSTRAINT "subscriptions_reminder_days_matches_mode" CHECK (("subscriptions"."reminder_mode" = 'custom') = ("subscriptions"."reminder_days_before" is not null)),
	CONSTRAINT "subscriptions_reminder_days_range" CHECK ("subscriptions"."reminder_days_before" is null or "subscriptions"."reminder_days_before" between 0 and 30)
);
--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD CONSTRAINT "subscription_prices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_prices_timeline_idx" ON "subscription_prices" USING btree ("subscription_id","effective_date","recorded_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_next_billing_idx" ON "subscriptions" USING btree ("user_id","next_billing_date");