import { z } from 'zod';
import './loadEnv.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Where the web app is served; used for links in emails and the cross-site request check
  APP_URL: z.url().default('http://localhost:5173'),
  // Without a key, emails are printed to the log instead of sent
  // An empty value (as in .env.example) counts as unset
  RESEND_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().optional(),
  ),
  EMAIL_FROM: z.string().default('Subtracker <onboarding@resend.dev>'),
  // Requests allowed per IP (or per email) per 15 minutes on sensitive auth endpoints
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // Shared secret for POST /api/internal/tick (the scheduled trigger). Unset: endpoint disabled.
  CRON_SECRET: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32, 'must be at least 32 characters').optional(),
  ),
  // How often `npm run worker` runs a tick
  WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
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
  workerIntervalMs: vars.WORKER_INTERVAL_SECONDS * 1000,
  logLevel: vars.LOG_LEVEL ?? (vars.NODE_ENV === 'test' ? 'silent' : 'info'),
};
