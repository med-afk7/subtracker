import type { CookieOptions } from 'express';
import { env } from './env.js';

export const SESSION_COOKIE_NAME = 'sid';

// A session ends 12 hours after login, however active it is; then the user logs in again.
// Short enough that a forgotten session on a shared computer doesn't stay open for long.
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// httpOnly: JavaScript can't read it. sameSite=lax: browsers don't send it on cross-site
// POST/PATCH/DELETE requests, which blocks most CSRF. secure: HTTPS only in production.
export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
  maxAge: SESSION_MAX_AGE_MS,
};
