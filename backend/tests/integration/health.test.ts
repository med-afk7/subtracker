import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app.js';

describe('health and error handling', () => {
  it('reports healthy when the database answers', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found: GET /api/nope' },
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
