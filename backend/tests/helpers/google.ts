import request from 'supertest';
import app from '../../src/app.js';
import { setGoogleTokenClient } from '../../src/oauth/google.js';

export const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

// An unsigned JWT-shaped string; the app only reads the claims (see oauth/google.ts)
export function fakeIdToken(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
}

export interface GoogleUser {
  sub: string;
  email: string;
  email_verified?: boolean;
}

// Replaces Google's token endpoint. `user` decides who "signed in"; the nonce is echoed from
// the authorization request like Google does.
export function fakeGoogle(user: GoogleUser, overrides: Record<string, unknown> = {}) {
  const exchanges: { code: string; codeVerifier: string; redirectUri: string }[] = [];
  let nonce = '';
  setGoogleTokenClient({
    async exchangeCode(_config, params) {
      exchanges.push(params);
      return fakeIdToken({
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce,
        email_verified: true,
        ...user,
        ...overrides,
      });
    },
  });
  return {
    exchanges,
    setNonce: (value: string) => {
      nonce = value;
    },
  };
}

// Runs the whole browser round trip: start -> (Google) -> callback. Returns the callback
// response and the agent, which holds the session cookie on success.
export async function googleSignIn(
  user: GoogleUser,
  options: { agent?: ReturnType<typeof request.agent>; timezone?: string } = {},
) {
  const agent = options.agent ?? request.agent(app);
  const google = fakeGoogle(user);
  const start = await agent
    .get('/api/auth/google/start')
    .query(options.timezone ? { timezone: options.timezone } : {})
    .expect(303);
  const authorizeUrl = new URL(start.headers.location!);
  google.setNonce(authorizeUrl.searchParams.get('nonce')!);

  const callback = await agent
    .get('/api/auth/google/callback')
    .query({ code: 'auth-code', state: authorizeUrl.searchParams.get('state') })
    .expect(303);
  return { agent, start, authorizeUrl, callback, google };
}
