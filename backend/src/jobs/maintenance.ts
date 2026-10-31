import { and, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { emailTokens, sessions } from '../db/schema.js';
import { refreshStaleNextBillingDates } from '../services/subscriptions.service.js';

// Housekeeping that keeps queries correct and tables small
export async function runMaintenance(now: Date) {
  // The scheduler relies on next_billing_date being current
  const nextBillingDatesRefreshed = await refreshStaleNextBillingDates({ now });

  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });

  // Used or expired verification/reset tokens are useless after a day
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const oldTokens = await db
    .delete(emailTokens)
    .where(
      or(
        lt(emailTokens.expiresAt, dayAgo),
        and(isNotNull(emailTokens.usedAt), lt(emailTokens.usedAt, dayAgo)),
      ),
    )
    .returning({ id: emailTokens.id });

  return {
    nextBillingDatesRefreshed,
    sessionsDeleted: expiredSessions.length,
    tokensDeleted: oldTokens.length,
  };
}
