import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { db } from '../../src/db/index.js';
import { authIdentities, users } from '../../src/db/schema.js';
import { pkceChallenge } from '../../src/lib/crypto.js';
import { resetDatabase } from '../helpers/db.js';
import { lastEmailTo, tokenFrom } from '../helpers/email.js';
import { CLIENT_ID, fakeGoogle, googleSignIn } from '../helpers/google.js';
import { PASSWORD, registerUser, signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

const APP = 'http://localhost:5173';
const ada = { sub: 'google-ada', email: 'ada@example.com' };
const FAILED = `${APP}/login?google=failed`;

const userByEmail = (email: string) => db.query.users.findFirst({ where: eq(users.email, email) });

describe('Google sign-in: starting', () => {
  it('says Google is available', async () => {
    const res = await request(app).get('/api/auth/providers').expect(200);
    expect(res.body.data).toEqual({ google: true });
  });

  it('redirects to Google with PKCE, state and nonce, remembered in a scoped cookie', async () => {
    const res = await request(app).get('/api/auth/google/start').expect(303);
    const url = new URL(res.headers.location!);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: `${APP}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email',
      code_challenge_method: 'S256',
    });
    for (const param of ['state', 'nonce', 'code_challenge']) {
      expect(url.searchParams.get(param)).toMatch(/^[\w-]{43}$/);
    }

    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!;
    expect(cookie).toMatch(/^google_oauth=/);
    expect(cookie).toMatch(/Path=\/api\/auth\/google/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    // The secret parts never appear in the URL
    expect(res.headers.location).not.toContain('code_verifier');
  });
});

describe('Google sign-in: accounts', () => {
  it('creates a verified, password-less account on first sign-in', async () => {
    const { agent, callback, authorizeUrl, google } = await googleSignIn(ada, {
      timezone: 'Europe/Paris',
    });
    expect(callback.headers.location).toBe(`${APP}/`);

    // The code was exchanged with the verifier that matches the challenge sent to Google
    const [exchange] = google.exchanges;
    expect(exchange).toMatchObject({
      code: 'auth-code',
      redirectUri: `${APP}/api/auth/google/callback`,
    });
    expect(pkceChallenge(exchange!.codeVerifier)).toBe(
      authorizeUrl.searchParams.get('code_challenge'),
    );

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data).toMatchObject({
      email: 'ada@example.com',
      timezone: 'Europe/Paris',
      hasPassword: false,
    });
    const user = await userByEmail('ada@example.com');
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.passwordHash).toBeNull();
  });

  it('logs a returning user in to the same account, even if their Google email changed', async () => {
    await googleSignIn(ada);
    const { agent } = await googleSignIn({ ...ada, email: 'ada.new@example.com' });

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.email).toBe('ada@example.com');
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('links to an existing verified account with the same email, keeping its password', async () => {
    await signedInAgent('ada@example.com');
    const { agent } = await googleSignIn(ada);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.hasPassword).toBe(true);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(authIdentities)).toHaveLength(1);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: PASSWORD })
      .expect(200);
  });

  it("takes over an unverified sign-up and drops the stranger's password", async () => {
    // Someone registered Ada's address without being able to confirm it
    await registerUser('ada@example.com', 'attacker password');
    const { agent } = await googleSignIn(ada);

    await agent.get('/api/auth/me').expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'attacker password' })
      .expect(401);
  });

  it('refuses a second Google account for an already-linked user', async () => {
    await googleSignIn(ada);
    const { callback, agent } = await googleSignIn({ sub: 'google-other', email: ada.email });
    expect(callback.headers.location).toBe(FAILED);
    await agent.get('/api/auth/me').expect(401);
  });

  it('refuses an address Google has not verified', async () => {
    const { callback } = await googleSignIn({ ...ada, email_verified: false });
    expect(callback.headers.location).toBe(FAILED);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe('Google sign-in: forged and replayed callbacks', () => {
  it('refuses a callback whose state does not match the cookie (login CSRF)', async () => {
    const agent = request.agent(app);
    const google = fakeGoogle(ada);
    await agent.get('/api/auth/google/start').expect(303);

    const res = await agent
      .get('/api/auth/google/callback')
      .query({ code: 'attacker-code', state: 'attacker-state' })
      .expect(303);
    expect(res.headers.location).toBe(FAILED);
    expect(google.exchanges).toHaveLength(0);
    await agent.get('/api/auth/me').expect(401);
  });

  it('refuses a callback from a browser that never started a sign-in', async () => {
    const google = fakeGoogle(ada);
    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'auth-code', state: 'anything' })
      .expect(303);
    expect(res.headers.location).toBe(FAILED);
    expect(google.exchanges).toHaveLength(0);
  });

  it('accepts each sign-in attempt only once', async () => {
    const { agent, authorizeUrl } = await googleSignIn(ada);
    const replay = await agent
      .get('/api/auth/google/callback')
      .query({ code: 'auth-code', state: authorizeUrl.searchParams.get('state') })
      .expect(303);
    expect(replay.headers.location).toBe(FAILED);
  });

  it('sends people who cancel at Google back to the login page', async () => {
    const agent = request.agent(app);
    await agent.get('/api/auth/google/start').expect(303);
    const res = await agent
      .get('/api/auth/google/callback')
      .query({ error: 'access_denied' })
      .expect(303);
    expect(res.headers.location).toBe(`${APP}/login?google=cancelled`);
  });
});

describe('Google-only accounts', () => {
  it('cannot log in with a password until one is set through the emailed link', async () => {
    const { agent } = await googleSignIn(ada);
    await request(app)
      .post('/api/auth/login')
      .send({ email: ada.email, password: 'anything at all' })
      .expect(401);

    const change = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'a brand new password' })
      .expect(400);
    expect(change.body.error.code).toBe('NO_PASSWORD');

    await request(app).post('/api/auth/forgot-password').send({ email: ada.email }).expect(202);
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: tokenFrom(lastEmailTo(ada.email)), newPassword: 'a brand new password' })
      .expect(204);
    await request(app)
      .post('/api/auth/login')
      .send({ email: ada.email, password: 'a brand new password' })
      .expect(200);
  });

  it('deletes the account when the email is typed to confirm', async () => {
    const { agent } = await googleSignIn(ada);
    const wrong = await agent.delete('/api/account').send({ confirmEmail: 'nope' }).expect(400);
    expect(wrong.body.error.code).toBe('INVALID_CONFIRMATION');

    await agent.delete('/api/account').send({ confirmEmail: ' Ada@Example.com ' }).expect(204);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(authIdentities)).toHaveLength(0);
  });

  it('still requires the password for accounts that have one', async () => {
    const agent = await signedInAgent('grace@example.com');
    await agent.delete('/api/account').send({ confirmEmail: 'grace@example.com' }).expect(400);
    await agent.get('/api/auth/me').expect(200);
  });
});
