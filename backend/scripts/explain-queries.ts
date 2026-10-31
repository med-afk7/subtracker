// Index review: seeds the TEST database with realistic volume, then shows the query plan of each
// hot query. Run with `npm run db:explain -w backend`. Like the tests, it refuses to touch the
// development database, and it wipes the test database's tables.
import pg from 'pg';
import { loadTestEnv } from '../tests/setup/testEnv.js';

const USERS = 2_000;
const SUBS_PER_USER = 25;

const pool = new pg.Pool({ connectionString: loadTestEnv() });
const q = (text: string, values: unknown[] = []) => pool.query(text, values);

async function seed() {
  await q('TRUNCATE users RESTART IDENTITY CASCADE');
  await q(
    `INSERT INTO users (email, password_hash, email_verified_at)
           SELECT 'user' || g || '@example.com', 'x', now() FROM generate_series(1, $1) g`,
    [USERS],
  );
  await q(
    `INSERT INTO subscriptions (user_id, name, category_id, amount_minor, currency, billing_interval,
             start_date, billing_anchor_date, next_billing_date, status, cancelled_at)
           SELECT u.id, 'Subscription ' || s, (s % 7) + 1, 500 + s * 37, 'USD', 'month',
             date '2025-01-01', date '2025-01-01' + s, current_date + ((s * 7 + length(u.email)) % 45),
             CASE WHEN s % 10 = 0 THEN 'cancelled'::subscription_status ELSE 'active' END,
             CASE WHEN s % 10 = 0 THEN now() END
           FROM users u CROSS JOIN generate_series(1, $1) s`,
    [SUBS_PER_USER],
  );
  await q(`INSERT INTO subscription_prices (subscription_id, amount_minor, currency, effective_date, source)
           SELECT id, amount_minor, currency, start_date, 'initial' FROM subscriptions`);
  await q(`INSERT INTO subscription_prices (subscription_id, amount_minor, currency, effective_date, source)
           SELECT id, amount_minor + 100, currency, date '2026-03-01', 'manual_update'
           FROM subscriptions WHERE amount_minor % 3 = 0`);
  await q(`INSERT INTO sessions (id, user_id, expires_at)
           SELECT md5(id::text), id, now() + interval '30 days' FROM users`);
  // A year of reminder history: mostly sent, a few waiting
  await q(`INSERT INTO notification_deliveries (subscription_id, billing_date, days_before, scheduled_for,
             status, next_attempt_at)
           SELECT s.id, date '2025-11-01' + (m || ' months')::interval, 3, now() - interval '1 day',
             CASE WHEN m = 11 AND s.amount_minor % 50 = 0 THEN 'pending'::delivery_status ELSE 'sent' END,
             now() - interval '1 day'
           FROM subscriptions s CROSS JOIN generate_series(0, 11) m
           WHERE s.amount_minor % 4 = 0`);
  await q('ANALYZE');
}

async function explain(title: string, sql: string, values: unknown[] = []) {
  const { rows } = await q(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, values);
  const lines = rows.map((r) => r['QUERY PLAN'] as string);
  const scans = lines
    .filter((l) => /Scan|Bitmap/.test(l))
    .map((l) => l.trim().replace(/\s+\(cost=.*$/, ''));
  const time = lines.find((l) => l.startsWith('Execution Time'));
  console.log(`\n${title}\n  ${scans.join('\n  ')}\n  ${time}`);
}

await seed();
const counts =
  await q(`SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM subscriptions) subs,
  (SELECT count(*) FROM subscription_prices) prices, (SELECT count(*) FROM notification_deliveries) deliveries`);
console.log('Seeded:', counts.rows[0]);

const {
  rows: [user],
} = await q(`SELECT id FROM users ORDER BY email LIMIT 1 OFFSET 777`);
const {
  rows: [session],
} = await q(`SELECT id FROM sessions WHERE user_id = $1`, [user.id]);
const { rows: subs } = await q(`SELECT id FROM subscriptions WHERE user_id = $1`, [user.id]);

await explain(
  '1. Session lookup (every authenticated request)',
  `SELECT * FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.id = $1 AND s.expires_at > now() AND s.last_used_at > now() - interval '7 days'`,
  [session.id],
);
await explain(
  '2. Subscription list, sorted by next billing date, page 1',
  `SELECT * FROM subscriptions s JOIN categories c ON c.id = s.category_id
   WHERE s.user_id = $1 AND s.archived_at IS NULL
   ORDER BY s.next_billing_date ASC NULLS LAST, s.id LIMIT 20`,
  [user.id],
);
await explain(
  '3. Reminder scheduler: active subscriptions due soon, all users',
  `SELECT * FROM subscriptions s JOIN users u ON u.id = s.user_id
   WHERE s.status = 'active' AND s.archived_at IS NULL AND s.reminder_mode <> 'off'
     AND u.reminders_enabled AND u.email_verified_at IS NOT NULL
     AND s.next_billing_date BETWEEN current_date - 1 AND current_date + 1`,
);
await explain(
  '4. Reminder dispatcher: claimable rows',
  `SELECT id FROM notification_deliveries
   WHERE (status IN ('pending', 'retrying') AND next_attempt_at <= now())
      OR (status = 'sending' AND locked_until <= now())
   ORDER BY next_attempt_at LIMIT 20`,
);
await explain(
  '5. Price history for one user’s subscriptions (calendar, trends)',
  `SELECT * FROM subscription_prices WHERE subscription_id = ANY($1::uuid[])`,
  [subs.map((s) => s.id)],
);
await explain(
  '6. Reminder history page for one user',
  `SELECT * FROM notification_deliveries d JOIN subscriptions s ON s.id = d.subscription_id
   WHERE s.user_id = $1 ORDER BY d.scheduled_for DESC, d.id DESC LIMIT 10`,
  [user.id],
);

await pool.end();
