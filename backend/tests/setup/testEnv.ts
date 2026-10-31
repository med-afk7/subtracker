import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const backendDir = path.resolve(import.meta.dirname, '..', '..');

// Same Neon endpoint whether the URL is pooled or direct
const endpointOf = (url: string) => new URL(url).hostname.replace('-pooler', '');

// Points the app at the test database. The tests wipe every table, so this refuses to run
// against the development database.
export function loadTestEnv(): string {
  dotenv.config({ path: path.join(backendDir, '.env.test'), quiet: true });

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set (see backend/.env.example)');
  }

  const devEnvFile = path.join(backendDir, '..', '.env.local');
  if (fs.existsSync(devEnvFile)) {
    const devUrl = dotenv.parse(fs.readFileSync(devEnvFile)).DATABASE_URL;
    if (devUrl && endpointOf(devUrl) === endpointOf(testUrl)) {
      throw new Error('TEST_DATABASE_URL points at the development database; refusing to wipe it');
    }
  }

  process.env.DATABASE_URL = testUrl;
  process.env.APP_URL = 'http://localhost:5173';
  // High enough that normal tests never hit it; rate-limit.test.ts lowers it
  process.env.AUTH_RATE_LIMIT_MAX ??= '1000';
  process.env.CRON_SECRET = 'test-cron-secret-that-is-at-least-32-characters';
  // Never send real email from tests
  delete process.env.RESEND_API_KEY;
  return testUrl;
}
