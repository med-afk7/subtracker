import { z } from 'zod';
import './loadEnv.js';

// An empty value (as in .env.example) counts as unset
const optionalString = (schema: z.ZodString = z.string()) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    // Where the web app is served; used for links in emails and the cross-site request check
    APP_URL: z.url().default('http://localhost:5173'),
    // Without a key, emails are printed to the log instead of sent
    RESEND_API_KEY: optionalString(),
    EMAIL_FROM: z.string().default('Subtracker <onboarding@resend.dev>'),
    // Requests allowed per IP (or per email) per 15 minutes on sensitive auth endpoints
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    // Shared secret for POST /api/internal/tick (the scheduled trigger). Unset: endpoint disabled.
    CRON_SECRET: optionalString(z.string().min(32, 'must be at least 32 characters')),
    // How many proxies sit in front of the API (e.g. 2 for Vercel -> Render). Express then reads the
    // real client IP from X-Forwarded-For, which rate limiting and logs depend on. 0 = no proxy.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // "Continue with Google". Both unset: the button is hidden and the endpoints answer 404.
    GOOGLE_CLIENT_ID: optionalString(),
    GOOGLE_CLIENT_SECRET: optionalString(),
    // How often `npm run worker` runs a tick
    WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  })
  .refine((vars) => Boolean(vars.GOOGLE_CLIENT_ID) === Boolean(vars.GOOGLE_CLIENT_SECRET), {
    message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
    path: ['GOOGLE_CLIENT_SECRET'],
  });

// Fail fast on startup with a readable message instead of failing later at first use
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

const vars = parsed.data;

export const env = {
  nodeEnv: vars.NODE_ENV,
  isProduction: vars.NODE_ENV === 'production',
  port: vars.PORT,
  databaseUrl: vars.DATABASE_URL,
  appUrl: vars.APP_URL.replace(/\/$/, ''),
  appOrigin: new URL(vars.APP_URL).origin,
  resendApiKey: vars.RESEND_API_KEY,
  emailFrom: vars.EMAIL_FROM,
  authRateLimitMax: vars.AUTH_RATE_LIMIT_MAX,
  cronSecret: vars.CRON_SECRET,
  trustProxy: vars.TRUST_PROXY,
  google:
    vars.GOOGLE_CLIENT_ID && vars.GOOGLE_CLIENT_SECRET
      ? { clientId: vars.GOOGLE_CLIENT_ID, clientSecret: vars.GOOGLE_CLIENT_SECRET }
      : null,
  workerIntervalMs: vars.WORKER_INTERVAL_SECONDS * 1000,
  logLevel: vars.LOG_LEVEL ?? (vars.NODE_ENV === 'test' ? 'silent' : 'info'),
};
