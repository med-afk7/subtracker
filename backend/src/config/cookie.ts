import type { CookieOptions } from 'express';
import { env } from './env.js';

export const SESSION_COOKIE_NAME = 'sid';

// Absolute lifetime of a session; an idle timeout also applies (see services/sessions)
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// httpOnly: JavaScript can't read it. sameSite=lax: browsers don't send it on cross-site
// POST/PATCH/DELETE requests, which blocks most CSRF. secure: HTTPS only in production.
export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
  maxAge: SESSION_MAX_AGE_MS,
};
