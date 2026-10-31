import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// The test setup has already loaded the config with a high limit. Drop the cached modules,
// lower the limit, and import a fresh app whose limiters see the new value.
vi.resetModules();
process.env.AUTH_RATE_LIMIT_MAX = '3';
const { default: app } = await import('../../src/app.js');

describe('rate limiting', () => {
  it('blocks the fourth login attempt for the same email', async () => {
    const attempt = () =>
      request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'guess' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('counts each route separately', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'someone-else@example.com' });
    expect(res.status).toBe(202);
  });
});
