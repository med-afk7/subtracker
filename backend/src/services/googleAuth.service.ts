import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authIdentities, users } from '../db/schema.js';
import { isUniqueViolation } from '../lib/dbErrors.js';
import { GoogleAuthError, type GoogleProfile } from '../oauth/google.js';
import type { LoginResult } from './auth.service.js';
import { createSession, deleteUserSessions } from './sessions.service.js';

// Signs in with a Google identity, creating or linking the account on first use:
// 1. Known Google identity: log in to the account it belongs to.
// 2. Unknown identity, but an account with the same (Google-verified) email: link it.
// 3. Neither: create an account. It has no password until the user sets one.
export async function signInWithGoogle(
  profile: GoogleProfile,
  timezone: string,
): Promise<LoginResult & { isNewUser: boolean }> {
  try {
    return await db.transaction(async (tx) => {
      const [linked] = await tx
        .select({ user: users })
        .from(authIdentities)
        .innerJoin(users, eq(users.id, authIdentities.userId))
        .where(
          and(eq(authIdentities.provider, 'google'), eq(authIdentities.subject, profile.subject)),
        );
      if (linked) {
        return {
          user: linked.user,
          sessionToken: await createSession(linked.user.id, tx),
          isNewUser: false,
        };
      }

      let user = await tx.query.users.findFirst({ where: eq(users.email, profile.email) });
      const isNewUser = !user;

      if (!user) {
        [user] = await tx
          .insert(users)
          .values({
            email: profile.email,
            passwordHash: null,
            timezone,
            emailVerifiedAt: new Date(),
          })
          .returning();
      } else if (!user.emailVerifiedAt) {
        // Someone signed up with this address but never proved they own it. It may have been an
        // attacker hoping the real owner adopts the account later ("pre-account takeover"), so
        // their password and any sessions go; Google has just proved who owns the address.
        [user] = await tx
          .update(users)
          .set({ passwordHash: null, emailVerifiedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        await deleteUserSessions(user!.id, { executor: tx });
      }
      if (!user) throw new Error('User row missing after insert or update');

      await tx
        .insert(authIdentities)
        .values({ provider: 'google', subject: profile.subject, userId: user.id });
      return { user, sessionToken: await createSession(user.id, tx), isNewUser };
    });
  } catch (err) {
    // The account is already linked to a different Google account, or two first sign-ins raced
    if (isUniqueViolation(err)) throw new GoogleAuthError('identity_conflict');
    throw err;
  }
}
