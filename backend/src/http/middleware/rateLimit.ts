import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;

// In-memory counters: fine for one API instance. Several instances would each allow the full
// limit, so a shared (Postgres) store would be needed then (docs §9).
function limiter(keyGenerator?: Options['keyGenerator']) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: env.authRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' },
      });
    },
  });
}

// One counter per client IP. Call once per route so each route has its own counter.
export const limitByIp = () => limiter();

// One counter per target email address: slows password guessing spread over many IPs, and
// stops anyone flooding a victim's inbox with reset or verification emails
export const limitByEmail = () =>
  limiter((req) => {
    const email: unknown = req.body?.email;
    return typeof email === 'string' && email.trim() !== ''
      ? `email:${email.trim().toLowerCase()}`
      : ipKeyGenerator(req.ip ?? '');
  });
