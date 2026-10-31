import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { resetDatabase } from '../helpers/db.js';
import { lastEmailTo, outbox, tokenFrom } from '../helpers/email.js';
import { PASSWORD, registerUser, sessionCookieFrom, signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

const NEW_PASSWORD = 'a brand new passphrase';
const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });
const forgot = (email: string) =>
  request(app).post('/api/auth/forgot-password').send({ email }).expect(202);
const reset = (token: string, newPassword = NEW_PASSWORD) =>
  request(app).post('/api/auth/reset-password').send({ token, newPassword });

describe('forgot and reset password', () => {
  it('answers the same for unknown emails and sends nothing', async () => {
    const res = await forgot('nobody@example.com');
    expect(res.body.data.message).toBeDefined();
    expect(outbox).toHaveLength(0);
  });

  it('resets the password, logs out every session, and the link works once', async () => {
    const agent = await signedInAgent('ada@example.com');
    await forgot('ada@example.com');
    const token = tokenFrom(lastEmailTo('ada@example.com'));

    await reset(token).expect(204);

    await agent.get('/api/auth/me').expect(401); // existing session revoked
    await login('ada@example.com', PASSWORD).expect(401);
    await login('ada@example.com', NEW_PASSWORD).expect(200);

    const reused = await reset(token, 'yet another passphrase').expect(400);
    expect(reused.body.error.code).toBe('INVALID_TOKEN');
  });

  it('counts as email verification for an account that never verified', async () => {
    await registerUser('ada@example.com');
    await forgot('ada@example.com');
    await reset(tokenFrom(lastEmailTo('ada@example.com'))).expect(204);
    await login('ada@example.com', NEW_PASSWORD).expect(200);
  });

  it('does not accept a verification token as a reset token', async () => {
    await registerUser('ada@example.com');
    const verificationToken = tokenFrom(lastEmailTo('ada@example.com'));
    await reset(verificationToken).expect(400);
  });
});

describe('change password', () => {
  it('requires the current password', async () => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'wrong password', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
  });

  it('logs out other sessions and keeps this one with a fresh session token', async () => {
    const agent = await signedInAgent('ada@example.com');
    const otherDevice = sessionCookieFrom(await login('ada@example.com', PASSWORD).expect(200));

    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);
    expect(sessionCookieFrom(res)).toMatch(/^sid=/);

    await agent.get('/api/auth/me').expect(200);
    await request(app).get('/api/auth/me').set('Cookie', otherDevice).expect(401);
    await login('ada@example.com', NEW_PASSWORD).expect(200);
  });
});
