import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app.js';

describe('cross-site request protection', () => {
  it('rejects state-changing requests from another origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'ada@example.com', password: 'whatever' })
      .expect(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('accepts requests from the app’s own origin', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'ada@example.com' })
      .expect(202);
  });

  it('rejects non-JSON bodies, which is what a plain HTML form would send', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .type('form')
      .send('email=ada@example.com')
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('allows safe methods from any origin', async () => {
    await request(app).get('/api/health').set('Origin', 'https://evil.example').expect(200);
  });
});

const SOME_ID = '00000000-0000-4000-8000-000000000000';

describe('authentication is required', () => {
  it.each([
    ['get', '/api/auth/me'],
    ['post', '/api/auth/logout'],
    ['post', '/api/auth/change-password'],
    ['patch', '/api/account'],
    ['delete', '/api/account'],
    ['get', '/api/categories'],
    ['get', '/api/subscriptions'],
    ['post', '/api/subscriptions'],
    ['get', `/api/subscriptions/${SOME_ID}`],
    ['patch', `/api/subscriptions/${SOME_ID}`],
    ['delete', `/api/subscriptions/${SOME_ID}`],
    ['post', `/api/subscriptions/${SOME_ID}/cancel`],
    ['post', `/api/subscriptions/${SOME_ID}/archive`],
  ] as const)('%s %s -> 401', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
