import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';
import { isValidTimezone } from '../domain/timezone.js';
import { sendEmailInBackground } from '../email/sender.js';
import {
  accountExistsMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from '../email/templates.js';
import { isUniqueViolation } from '../lib/dbErrors.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, spendPasswordCheckTime, verifyPassword } from '../lib/passwords.js';
import { consumeEmailToken, issueEmailToken } from './emailTokens.service.js';
import { createSession, deleteUserSessions } from './sessions.service.js';
import { findUserByEmail, findUserById } from './users.service.js';

export interface LoginResult {
  user: UserRow;
  sessionToken: string;
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const invalidToken = () =>
  new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Request a new one.');
const invalidPassword = () =>
  new AppError(400, 'INVALID_PASSWORD', 'Your current password is incorrect');

async function sendVerificationEmail(user: UserRow) {
  const token = await issueEmailToken(user.id, 'verify_email');
  sendEmailInBackground(verifyEmailMessage(user.email, token), 'verify_email');
}

// The caller always answers "check your email", whether or not the address was new,
// so the response never reveals which emails have accounts.
export async function register(input: { email: string; password: string; timezone?: string }) {
  // Hash first in every case so new and existing emails take the same time
  const passwordHash = await hashPassword(input.password);
  const timezone = input.timezone && isValidTimezone(input.timezone) ? input.timezone : 'UTC';

  const existing = await findUserByEmail(input.email);
  if (existing) {
    if (existing.emailVerifiedAt) {
      sendEmailInBackground(accountExistsMessage(existing.email), 'account_exists');
    } else {
      await sendVerificationEmail(existing);
    }
    return;
  }

  try {
    const [user] = await db
      .insert(users)
      .values({ email: input.email, passwordHash, timezone })
      .returning();
    if (user) await sendVerificationEmail(user);
  } catch (err) {
    // Two sign-ups for the same email at the same moment: the other one won, which is fine
    if (!isUniqueViolation(err)) throw err;
  }
}

export async function verifyEmail(token: string): Promise<LoginResult> {
  const userId = await consumeEmailToken(token, 'verify_email');
  if (!userId) throw invalidToken();

  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId))
    .returning();
  if (!user) throw invalidToken();

  // Clicking the link proves ownership of the address, so log the user in
  return { user, sessionToken: await createSession(user.id) };
}

export async function resendVerification(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (user && !user.emailVerifiedAt) await sendVerificationEmail(user);
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    await spendPasswordCheckTime(password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.passwordHash, password))) throw invalidCredentials();

  // Only reachable with the right password, so it reveals nothing to a stranger
  if (!user.emailVerifiedAt) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email address before logging in');
  }

  return { user, sessionToken: await createSession(user.id) };
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) return;

  const token = await issueEmailToken(user.id, 'reset_password');
  sendEmailInBackground(resetPasswordMessage(user.email, token), 'reset_password');
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const passwordHash = await hashPassword(newPassword);

  // Token, new password and session cleanup succeed or fail together
  return db.transaction(async (tx) => {
    const userId = await consumeEmailToken(token, 'reset_password', tx);
    if (!userId) throw invalidToken();

    await tx
      .update(users)
      // The reset link also proves the user owns the address
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(eq(users.id, userId));
    // Whoever knew the old password is logged out everywhere
    await deleteUserSessions(userId, { executor: tx });
    return userId;
  });
}

// Returns a new session token: every existing session, including the current one, is replaced
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  const user = await findUserById(userId);
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw invalidPassword();
  }

  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await deleteUserSessions(userId, { executor: tx });
    return createSession(userId, tx);
  });
}

export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !(await verifyPassword(user.passwordHash, password))) throw invalidPassword();

  // Foreign keys cascade: sessions, tokens and subscriptions go with the user
  await db.delete(users).where(eq(users.id, userId));
}

export async function updateTimezone(userId: string, timezone: string): Promise<UserRow> {
  const [user] = await db.update(users).set({ timezone }).where(eq(users.id, userId)).returning();
  if (!user) throw new Error(`User ${userId} not found while updating timezone`);
  return user;
}
