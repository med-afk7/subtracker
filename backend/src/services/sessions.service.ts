import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { SESSION_MAX_AGE_MS } from '../config/cookie.js';
import { db, type Database } from '../db/index.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { generateToken, hashToken } from '../lib/crypto.js';

// A session also ends after a week without use
const IDLE_TIMEOUT = sql`interval '7 days'`;
// Refresh last_used_at at most hourly so every request doesn't cost a database write
const TOUCH_AFTER_MS = 60 * 60 * 1000;

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

// Returns the raw token for the cookie; only its hash is stored
export async function createSession(userId: string, executor: Executor = db): Promise<string> {
  const token = generateToken();
  await executor.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
  });
  return token;
}

export interface AuthenticatedSession {
  sessionId: string;
  user: UserRow;
}

export async function findSession(token: string): Promise<AuthenticatedSession | null> {
  const sessionId = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.lastUsedAt, sql`now() - ${IDLE_TIMEOUT}`),
      ),
    );
  if (!row) return null;

  if (Date.now() - row.session.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  return { sessionId, user: row.user };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// Logs the user out everywhere, optionally keeping one session
export async function deleteUserSessions(
  userId: string,
  options: { except?: string; executor?: Executor } = {},
): Promise<void> {
  const { except, executor = db } = options;
  await executor
    .delete(sessions)
    .where(
      except
        ? and(eq(sessions.userId, userId), ne(sessions.id, except))
        : eq(sessions.userId, userId),
    );
}

export type { Executor };
