import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Fresh app with one trusted proxy hop and a tiny limit (see rate-limit.test.ts for why)
vi.resetModules();
process.env.TRUST_PROXY = '1';
process.env.AUTH_RATE_LIMIT_MAX = '2';
const { default: app } = await import('../../src/app.js');

// A unique email every time, so only the per-IP limiter can trigger
let n = 0;
const forgot = (clientIp: string) =>
  request(app)
    .post('/api/auth/forgot-password')
    .set('X-Forwarded-For', clientIp)
    .send({ email: `user${++n}@example.com` });

describe('behind a trusted proxy', () => {
  it('rate-limits each real client separately instead of everyone as the proxy', async () => {
    expect((await forgot('203.0.113.1')).status).toBe(202);
    expect((await forgot('203.0.113.1')).status).toBe(202);
    expect((await forgot('203.0.113.1')).status).toBe(429);

    // A different client behind the same proxy still has its own allowance
    expect((await forgot('198.51.100.7')).status).toBe(202);
  });
});
