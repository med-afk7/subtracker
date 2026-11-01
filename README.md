# Subly

Subscriptions are easy to forget: a free trial that turns into a yearly charge, a price that
quietly goes up, three streaming services when you watch one. Subly keeps every recurring
expense in one place, tells you what they really cost per month and per year, shows when each
charge is coming, and emails you before it happens.

**Stack:** TypeScript everywhere. Express 5 API with Drizzle ORM on PostgreSQL (Neon), zod
validation, pino logging; React + Vite frontend; Vitest + Supertest; GitHub Actions.

**Docs:** [architecture and design decisions](docs/architecture.md) ·
[deployment guide](docs/deployment.md) · interactive API reference at `/api/docs` (OpenAPI 3.1)

## What it does

- **Accounts:** email + password with email verification, or "Continue with Google"; password
  reset, server-side sessions, rate limiting, timezone, account deletion.
- **Subscriptions:** pick from about 70 popular services (Netflix, Spotify, iCloud+...) with
  their logos, or add your own; any currency, weekly to multi-year billing, cancel/archive
  lifecycle, price history kept when prices change, search/filter/sort/pagination, CSV export.
  Presets fill in the name, category and website but never the price, which varies by country
  and plan.
- **Dashboard:** monthly-equivalent and yearly cost per currency, spending by category, upcoming
  charges, recent price changes, monthly cost over time, and a 30-day/90-day/12-month forecast.
- **Calendar:** every expected charge on a month grid, past ones at the price that applied then.
- **Reminders:** an email at 09:00 in your timezone, a chosen number of days before each charge.

## How it works (the interesting parts)

- **Billing dates** come from one pure, heavily tested module. Every charge is computed from an
  anchor date (`anchor + k × interval`), never from the previous charge, so a plan billed on the
  31st bills Feb 28 and then Mar 31 again instead of drifting. Leap years, time zones and
  daylight-saving changes are covered by tests. → [architecture §4.2](docs/architecture.md)
- **Money** is integer minor units plus an ISO currency, exchanged as decimal strings. Totals keep
  exact fractions and round once (three weekly $1 plans are $13.00 a month, not $12.99).
  Currencies are never added together. → [§4.3](docs/architecture.md)
- **Price history** is an append-only table written in the same transaction as the price change,
  with the subscription row locked, so history and current price can't disagree.
- **Reminders** use Postgres as the job queue: a unique index allows one reminder per charge,
  workers claim rows with `FOR UPDATE SKIP LOCKED`, a lease plus a fencing token handles crashed
  workers, temporary failures retry with backoff, and the provider's idempotency key covers the
  crash-after-send window. Guarantee: at most one reminder per charge, never silently lost.
  → [§6](docs/architecture.md)
- **Security:** Argon2id passwords; session tokens and email tokens stored only as SHA-256
  hashes; single-use, expiring links; no account enumeration; origin + JSON checks against CSRF on
  top of `SameSite` cookies; per-IP and per-email rate limits; every query scoped to the owner
  (another user's id is a 404, tested on every endpoint); CSV formula-injection protection;
  security headers; secrets redacted from logs.
- **Google sign-in** is a server-side OpenID Connect code flow with PKCE, `state` and `nonce`
  held in a short-lived cookie; ID token claims are checked (issuer, audience, expiry, nonce,
  verified email). Accounts are matched by Google's stable user id, linked by verified email,
  and an unverified password sign-up on the same address loses its password on takeover.

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

## Testing

330+ automated tests, run in CI on every push:

- **Unit tests** for the pure logic: billing dates (month ends, leap years, DST), money (rounding,
  currency precision), lifecycle rules, reminder timing, CSV escaping, trends and forecasts.
- **Integration tests** against a real Postgres database (Supertest over HTTP): every endpoint's
  main flows and validation, ownership checks as a second user on every route, transactions
  under concurrent edits, two reminder workers racing, crash recovery, retry and failure paths.
- **Mutation checks during development:** removing an ownership filter, a retry wait or the
  duplicate-reminder guard makes the matching test fail.

The integration tests **wipe their database**, so they use a separate one: the Neon `test`
branch locally, a fresh Postgres container in CI. The setup refuses to run against the
development database.

```bash
echo "TEST_DATABASE_URL=$(neon connection-string test)" > backend/.env.test
npm test
npm run db:explain -w backend   # seeds the test DB with 50k subscriptions and shows query plans
```

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

## Deployment

Vercel (frontend, proxying `/api`) + Render (API) + Neon (Postgres) + Resend (email) + a GitHub
Actions schedule for reminders. Step by step, with the trade-offs: [docs/deployment.md](docs/deployment.md).

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

---

Service logos are from [Simple Icons](https://simpleicons.org) (CC0). Trademarks belong to their
owners; services without an open-licensed icon show a letter instead.
