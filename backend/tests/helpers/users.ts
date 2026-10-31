import request from 'supertest';
import app from '../../src/app.js';
import { lastEmailTo, tokenFrom } from './email.js';

export const PASSWORD = 'correct horse battery';

export async function registerUser(email: string, password = PASSWORD) {
  await request(app).post('/api/auth/register').send({ email, password }).expect(202);
}

// Registers, clicks the verification link and returns an agent holding the session cookie
export async function signedInAgent(email: string, password = PASSWORD) {
  await registerUser(email, password);
  const agent = request.agent(app);
  await agent
    .post('/api/auth/verify-email')
    .send({ token: tokenFrom(lastEmailTo(email)) })
    .expect(200);
  return agent;
}

// The session cookie value from a response, e.g. to replay it later
export function sessionCookieFrom(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('sid='));
  if (!cookie) throw new Error('No session cookie in response');
  return cookie.split(';')[0]!;
}
