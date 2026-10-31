import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app.js';

describe('API documentation', () => {
  it('serves an OpenAPI 3.1 document generated from the validation schemas', async () => {
    const res = await request(app).get('/api/docs/openapi.json').expect(200);
    const doc = res.body;
    expect(doc.openapi).toBe('3.1.0');

    const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods as object).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations).toHaveLength(36);
    expect(operations).toEqual(
      expect.arrayContaining([
        'POST /api/auth/login',
        'PATCH /api/subscriptions/{id}',
        'GET /api/forecast',
      ]),
    );

    // Generated from the zod schema: required fields, enums and limits match what's validated
    const create =
      doc.paths['/api/subscriptions'].post.requestBody.content['application/json'].schema;
    expect(create.required).toEqual(['name', 'amount', 'currency', 'billingInterval', 'startDate']);
    expect(create.properties.billingInterval.enum).toEqual(['week', 'month', 'year']);
    const limit = doc.paths['/api/subscriptions'].get.parameters.find(
      (p: { name: string }) => p.name === 'limit',
    );
    expect(limit.schema).toMatchObject({ maximum: 100, default: 20 });
    expect(doc.paths['/api/auth/me'].get.security).toEqual([{ session: [] }]);
  });

  it('serves the docs page with a CSP that allows only the pinned CDN and its own script', async () => {
    const res = await request(app).get('/api/docs').expect(200);
    expect(res.text).toContain('swagger-ui-dist@5.17.14');
    expect(res.text).not.toMatch(/<script>[^<]/); // no inline script
    expect(res.headers['content-security-policy']).toContain(
      "script-src 'self' https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/",
    );
    await request(app)
      .get('/api/docs/init.js')
      .expect('Content-Type', /javascript/)
      .expect(200);
  });
});
