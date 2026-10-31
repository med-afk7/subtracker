import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { emailTokens, type EmailTokenPurpose } from '../db/schema.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import type { Executor } from './sessions.service.js';

const TOKEN_LIFETIME_MS: Record<EmailTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};

// Creates a new single-use token and retires older unused ones for the same purpose,
// so only the most recent email's link works. Returns the raw token for the link.
export async function issueEmailToken(userId: string, purpose: EmailTokenPurpose) {
  const token = generateToken();

  await db.transaction(async (tx) => {
    await tx
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
        ),
      );
    await tx.insert(emailTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS[purpose]),
    });
  });

  return token;
}

// Marks the token used and returns its user id, or null if it's unknown, used or expired.
// One atomic UPDATE: if two requests race with the same token, exactly one gets the row.
export async function consumeEmailToken(
  token: string,
  purpose: EmailTokenPurpose,
  executor: Executor = db,
): Promise<string | null> {
  const [row] = await executor
    .update(emailTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: emailTokens.userId });

  return row?.userId ?? null;
}
