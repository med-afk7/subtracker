CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sending', 'retrying', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('upcoming_charge');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "notification_kind" DEFAULT 'upcoming_charge' NOT NULL,
	"billing_date" date NOT NULL,
	"days_before" smallint NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_days_before_range" CHECK ("notification_deliveries"."days_before" between 0 and 30)
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_one_per_charge" ON "notification_deliveries" USING btree ("subscription_id","billing_date","kind");--> statement-breakpoint
CREATE INDEX "notification_deliveries_claimable_idx" ON "notification_deliveries" USING btree ("next_attempt_at") WHERE "notification_deliveries"."status" in ('pending', 'retrying', 'sending');--> statement-breakpoint
CREATE INDEX "subscriptions_active_next_billing_idx" ON "subscriptions" USING btree ("next_billing_date") WHERE "subscriptions"."status" = 'active';