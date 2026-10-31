# Subtracker

Track recurring subscriptions, see what they cost and when each one renews next.

- **backend/**: Node.js, TypeScript, Express 5, Drizzle ORM on Postgres (Neon), zod, pino
- **frontend/**: React, TypeScript, Vite
- **docs/architecture.md**: architecture, database design, API plan and roadmap

> Work in progress, rebuilt phase by phase following [docs/architecture.md](docs/architecture.md).
> Done: Phases 2 to 8: TypeScript foundation and CI, accounts (email verification, server-side
> sessions, password reset, rate limiting), the subscription model with price history, the
> dashboard with spending trends and forecasts, the billing calendar, email reminders
> (Postgres-backed queue, retries, idempotent delivery), subscription details, and CSV export.
> Next: Phase 9, production readiness and deployment.

## Local setup

Requirements: Node.js 24, the [Neon CLI](https://neon.com/docs/cli) (`npm i -g neon`).

1. Install dependencies (npm workspaces install both apps):
   ```bash
   npm install
   ```
2. Point your environment at the Neon `dev` branch. This writes `DATABASE_URL` (pooled, used by the
   app) and `DATABASE_URL_UNPOOLED` (direct, used by migrations) to `.env.local`:
   ```bash
   neon checkout dev
   ```
3. Create `backend/.env` from [backend/.env.example](backend/.env.example). Without a
   `RESEND_API_KEY`, emails such as the sign-up confirmation are printed to the API log, so you can
   open their links from there.
4. Apply migrations (or `npm run db:reset -w backend` to wipe the `dev` branch and rebuild it;
   the script refuses to run on any other branch):
   ```bash
   npm run db:migrate
   ```
5. Run the API and the web app in two terminals:
   ```bash
   npm run dev:api   # http://localhost:3000, pretty-printed logs
   npm run dev:web   # http://localhost:5173, forwards /api to the API
   ```

## Tests

The integration tests run against a real Postgres database and **wipe its tables**, so they use a
separate database: the Neon `test` branch locally, a Postgres container in CI.

```bash
echo "TEST_DATABASE_URL=$(neon connection-string test)" > backend/.env.test
npm test
```

The test setup refuses to run if `TEST_DATABASE_URL` points at the database in `.env.local`.

## Scripts (run from the repo root)

| Script                                | What it does                                     |
| ------------------------------------- | ------------------------------------------------ |
| `npm run dev:api` / `npm run dev:web` | Start the API / web app in watch mode            |
| `npm test`                            | Backend unit and integration tests (Vitest)      |
| `npm run lint`                        | ESLint for both apps                             |
| `npm run typecheck`                   | TypeScript checks for both apps                  |
| `npm run format` / `format:check`     | Prettier                                         |
| `npm run build`                       | Compile the API to `backend/dist`, bundle the UI |
| `npm run db:generate` / `db:migrate`  | Create / apply Drizzle migrations                |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs format check, lint, typecheck, tests
(against a fresh Postgres 16) and build on every push to `main` and every pull request.

## Background work (reminders)

Reminders go out at 09:00 in each user's timezone, a chosen number of days before a charge. A
**tick** does three things, each safe to repeat or run concurrently:

1. **Maintenance**: moves stale cached next billing dates forward, deletes expired sessions and
   tokens.
2. **Scheduler**: inserts a `notification_deliveries` row for every reminder that's due. A
   unique index on (subscription, billing date) means one reminder per charge, ever.
3. **Dispatcher**: claims rows with `FOR UPDATE SKIP LOCKED`, re-checks each is still valid,
   sends it through Resend with the row id as `Idempotency-Key`, and records the outcome.
   Temporary failures retry up to 5 times (1 min to 6 h apart); permanent ones fail at once.

Guarantee: at most one reminder row per charge, and at-least-once send attempts. If a worker
crashes after Resend accepted an email but before recording it, the retry reuses the same
idempotency key and Resend drops the duplicate (keys are kept for 24 hours).

Run it locally with `npm run worker -w backend` (interval: `WORKER_INTERVAL_SECONDS`). In
production, `.github/workflows/reminders.yml` calls `POST /api/internal/tick` every 15 minutes;
set the repository secrets `API_URL` and `CRON_SECRET`.

> The tick processes every user in the database it points at. Don't run it against a database
> holding real reminders unless you mean to send them.

## API

Success responses are `{ "data": ... }`. Errors are
`{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "path", "message" }] } }`.
State-changing requests must send JSON and, from browsers, come from `APP_URL`'s origin.

| Method | Route                               | Auth                 | Description                                                                                                                                                                                               |
| ------ | ----------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                       |                      | 200 if the API and database are up                                                                                                                                                                        |
| POST   | `/api/auth/register`                |                      | `{ email, password, timezone? }` → 202, emails a confirmation link                                                                                                                                        |
| POST   | `/api/auth/verify-email`            |                      | `{ token }` → 200, logs in                                                                                                                                                                                |
| POST   | `/api/auth/resend-verification`     |                      | `{ email }` → 202                                                                                                                                                                                         |
| POST   | `/api/auth/login`                   |                      | `{ email, password }` → 200 / 401 / 403 `EMAIL_NOT_VERIFIED`                                                                                                                                              |
| POST   | `/api/auth/logout`                  | yes                  | Ends this session → 204                                                                                                                                                                                   |
| POST   | `/api/auth/forgot-password`         |                      | `{ email }` → 202, emails a reset link                                                                                                                                                                    |
| POST   | `/api/auth/reset-password`          |                      | `{ token, newPassword }` → 204, logs out every session                                                                                                                                                    |
| POST   | `/api/auth/change-password`         | yes                  | `{ currentPassword, newPassword }` → 204, logs out other sessions                                                                                                                                         |
| GET    | `/api/auth/me`                      | yes                  | Current user                                                                                                                                                                                              |
| PATCH  | `/api/account`                      | yes                  | `{ timezone }`                                                                                                                                                                                            |
| DELETE | `/api/account`                      | yes                  | `{ password }` → 204, deletes the user and all their data                                                                                                                                                 |
| GET    | `/api/categories`                   | yes                  | Predefined categories                                                                                                                                                                                     |
| GET    | `/api/subscriptions`                | yes                  | `search, category, state, interval, sort, order, page, limit` → `{ data, pagination }`                                                                                                                    |
| POST   | `/api/subscriptions`                | yes                  | Create (body below) → 201                                                                                                                                                                                 |
| GET    | `/api/subscriptions/:id`            | yes                  | Details plus the next three billing dates                                                                                                                                                                 |
| PATCH  | `/api/subscriptions/:id`            | yes                  | Partial update; a price change is recorded in the price history                                                                                                                                           |
| DELETE | `/api/subscriptions/:id`            | yes                  | Delete, with its history → 204                                                                                                                                                                            |
| POST   | `/api/subscriptions/:id/cancel`     | yes                  | `{ endDate? }` records a cancellation (the provider isn't contacted)                                                                                                                                      |
| POST   | `/api/subscriptions/:id/reactivate` | yes                  | `{ nextBillingDate }` restarts billing from that date                                                                                                                                                     |
| POST   | `/api/subscriptions/:id/archive`    | yes                  | Hides a cancelled subscription, keeping its history                                                                                                                                                       |
| POST   | `/api/subscriptions/:id/unarchive`  | yes                  | Back to cancelled                                                                                                                                                                                         |
| GET    | `/api/subscriptions/:id/history`    | yes                  | Price points newest first, each with the previous price and change; overall change first → latest                                                                                                         |
| GET    | `/api/subscriptions/export`         | yes                  | CSV download: `type=subscriptions` (default) or `type=price-history`. Only the requester's data; formula-injection safe                                                                                   |
| GET    | `/api/dashboard/summary`            | yes                  | Active count, monthly-equivalent and annualized totals per currency, expected charges in the next 30 days, recent price changes                                                                           |
| GET    | `/api/dashboard/category-breakdown` | yes                  | Monthly-equivalent spend per category, per currency, largest first                                                                                                                                        |
| GET    | `/api/dashboard/spending-trends`    | yes                  | `months` 2-36 (default 12): recorded monthly-equivalent cost at each month end, per currency, rebuilt from start dates, cancellations and price history                                                   |
| GET    | `/api/forecast`                     | yes                  | `range` = `30d`, `90d` (default) or `12m`: expected payments from today, totalled per currency and per calendar month. Unlike the monthly equivalent, a yearly plan counts in full in the month it renews |
| GET    | `/api/calendar`                     | yes                  | `from, to` (YYYY-MM-DD, at most 366 days), `category?`, `subscriptionId?` → expected charges and per-currency totals. Past charges use the price that applied on that date                                |
| GET    | `/api/notification-preferences`     | yes                  | `{ remindersEnabled, defaultReminderDaysBefore }`                                                                                                                                                         |
| PATCH  | `/api/notification-preferences`     | yes                  | Update either field (days 0-30)                                                                                                                                                                           |
| GET    | `/api/notifications`                | yes                  | The user's reminder history, newest first (`page`, `limit` up to 50)                                                                                                                                      |
| POST   | `/api/internal/tick`                | `Bearer CRON_SECRET` | Runs the background work once; 404 when `CRON_SECRET` is unset                                                                                                                                            |

Subscription body: `{ name, category, amount: "15.99", currency: "USD", billingInterval: "week" | "month" | "year", billingIntervalCount, startDate, nextBillingDate?, endDate?, reminderMode: "default" | "custom" | "off", reminderDaysBefore?, paymentMethodLabel?, providerWebsite?, cancellationUrl?, notes? }`.
Amounts are decimal strings with at most the currency's number of decimals, stored as integer
minor units. Changing `billingInterval` or `billingIntervalCount` requires `nextBillingDate`. A
PATCH with a new `amount` may include `priceEffectiveDate` (defaults to today).

Money math: a subscription's yearly cost is `amount × payments per year` (week 52, month 12, year 1,
divided by the interval count); monthly equivalent is that ÷ 12. Costs are kept as exact fractions,
summed per currency and rounded once, half up, to the currency's minor unit. Currencies are never
combined. Annualized figures are estimates from current prices.

Responses to register, resend-verification and forgot-password are identical whether or not the
email has an account. Sensitive auth routes are rate-limited (429 `RATE_LIMITED`).
