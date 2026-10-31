import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { db } from '../../src/db/index.js';
import { emailTokens, sessions, users } from '../../src/db/schema.js';
import { hashToken } from '../../src/lib/crypto.js';
import { resetDatabase } from '../helpers/db.js';
import { lastEmailTo, outbox, tokenFrom } from '../helpers/email.js';
import { PASSWORD, registerUser, sessionCookieFrom, signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

const register = (body: object) => request(app).post('/api/auth/register').send(body);
const login = (email: string, password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

describe('registration', () => {
  it('creates an unverified user with a hashed password and emails a verification link', async () => {
    const res = await register({
      email: '  Ada@Example.com ',
      password: PASSWORD,
      timezone: 'Europe/London',
    }).expect(202);

    expect(res.body).toEqual({ data: { message: 'Check your email for a link to continue.' } });
    expect(res.headers['set-cookie']).toBeUndefined(); // not logged in until verified

    const user = await db.query.users.findFirst({ where: eq(users.email, 'ada@example.com') });
    expect(user).toMatchObject({ timezone: 'Europe/London', emailVerifiedAt: null });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(PASSWORD);

    const email = lastEmailTo('ada@example.com');
    expect(email.text).toMatch(/http:\/\/localhost:5173\/verify-email\?token=/);
  });

  it('falls back to UTC for an unknown timezone instead of failing', async () => {
    await register({ email: 'ada@example.com', password: PASSWORD, timezone: 'Mars/Base' });
    const user = await db.query.users.findFirst({ where: eq(users.email, 'ada@example.com') });
    expect(user?.timezone).toBe('UTC');
  });

  it('answers identically for an existing account and emails its owner instead', async () => {
    await signedInAgent('ada@example.com');
    const newEmail = await register({ email: 'new@example.com', password: PASSWORD });
    const existingEmail = await register({ email: 'ada@example.com', password: 'other password' });

    expect(existingEmail.status).toBe(newEmail.status);
    expect(existingEmail.body).toEqual(newEmail.body);
    expect(lastEmailTo('ada@example.com').subject).toBe('You already have a Subtracker account');

    // The original password still works; the second sign-up changed nothing
    await login('ada@example.com').expect(200);
  });

  it('re-sends verification to an unverified account, and only the newest link works', async () => {
    await registerUser('ada@example.com');
    const firstToken = tokenFrom(lastEmailTo('ada@example.com'));
    await registerUser('ada@example.com');
    const secondToken = tokenFrom(lastEmailTo('ada@example.com'));

    await request(app).post('/api/auth/verify-email').send({ token: firstToken }).expect(400);
    await request(app).post('/api/auth/verify-email').send({ token: secondToken }).expect(200);
  });

  it('validates input on the server', async () => {
    const res = await register({ email: 'not-an-email', password: 'short' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual([
      'email',
      'password',
    ]);
  });
});

describe('email verification', () => {
  it('verifies the address, logs the user in, and the link only works once', async () => {
    await registerUser('ada@example.com');
    const token = tokenFrom(lastEmailTo('ada@example.com'));

    const res = await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
    expect(res.body.data).toMatchObject({ email: 'ada@example.com', timezone: 'UTC' });
    expect(sessionCookieFrom(res)).toMatch(/^sid=/);

    const reused = await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
    expect(reused.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired link', async () => {
    await registerUser('ada@example.com');
    const token = tokenFrom(lastEmailTo('ada@example.com'));
    await db
      .update(emailTokens)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(emailTokens.tokenHash, hashToken(token)));

    await request(app).post('/api/auth/verify-email').send({ token }).expect(400);
  });

  it('stores only a hash of the token', async () => {
    await registerUser('ada@example.com');
    const token = tokenFrom(lastEmailTo('ada@example.com'));
    const rows = await db.select({ tokenHash: emailTokens.tokenHash }).from(emailTokens);
    expect(rows).toEqual([{ tokenHash: hashToken(token) }]);
  });

  it('resend-verification answers the same for unknown emails and sends nothing', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@example.com' })
      .expect(202);
    expect(res.body.data.message).toBeDefined();
    expect(outbox).toHaveLength(0);
  });
});

describe('login', () => {
  it('refuses unverified accounts, but only after a correct password', async () => {
    await registerUser('ada@example.com');

    const wrong = await login('ada@example.com', 'wrong password').expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const right = await login('ada@example.com').expect(403);
    expect(right.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await signedInAgent('ada@example.com');
    const wrongPassword = await login('ada@example.com', 'wrong password').expect(401);
    const unknownEmail = await login('nobody@example.com').expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('sets a secure session cookie and stores only its hash', async () => {
    await signedInAgent('ada@example.com');
    const res = await login('ADA@example.com').expect(200);

    const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Lax/);
    // Only the boolean `hasPassword`, never the hash itself
    expect(res.body.data.hasPassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|argon|"password/i);

    const token = sessionCookieFrom(res).slice('sid='.length);
    const stored = await db.query.sessions.findFirst({ where: eq(sessions.id, hashToken(token)) });
    expect(stored).toBeDefined();
  });
});

describe('sessions', () => {
  it('returns the current user while logged in', async () => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      email: 'ada@example.com',
      timezone: 'UTC',
      hasPassword: true,
      createdAt: expect.any(String),
    });
  });

  it('rejects a session cookie replayed after logout', async () => {
    await signedInAgent('ada@example.com');
    const cookie = sessionCookieFrom(await login('ada@example.com').expect(200));

    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('rejects missing, forged, expired and idle sessions', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', 'sid=forged').expect(401);

    await signedInAgent('ada@example.com');
    const cookie = sessionCookieFrom(await login('ada@example.com').expect(200));
    const sessionId = hashToken(cookie.slice('sid='.length));

    await db
      .update(sessions)
      .set({ lastUsedAt: sql`now() - interval '8 days'` })
      .where(eq(sessions.id, sessionId));
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);

    await db
      .update(sessions)
      .set({ lastUsedAt: sql`now()`, expiresAt: sql`now() - interval '1 second'` })
      .where(eq(sessions.id, sessionId));
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
});
