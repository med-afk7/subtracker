import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { sessions, subscriptionPrices, subscriptions, users } from '../../src/db/schema.js';
import { resetDatabase } from '../helpers/db.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { PASSWORD, signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

describe('account settings', () => {
  it('updates the timezone and rejects unknown ones', async () => {
    const agent = await signedInAgent('ada@example.com');

    const res = await agent
      .patch('/api/account')
      .send({ timezone: 'America/Los_Angeles' })
      .expect(200);
    expect(res.body.data.timezone).toBe('America/Los_Angeles');

    const bad = await agent.patch('/api/account').send({ timezone: 'Mars/Base' }).expect(400);
    expect(bad.body.error.details[0].path).toBe('timezone');
  });
});

describe('account deletion', () => {
  it('requires the password', async () => {
    const agent = await signedInAgent('ada@example.com');
    await agent.delete('/api/account').send({ password: 'wrong password' }).expect(400);
    await agent.get('/api/auth/me').expect(200);
  });

  it('deletes the user with their sessions and subscriptions', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent);
    const user = await db.query.users.findFirst({ where: eq(users.email, 'ada@example.com') });

    await agent.delete('/api/account').send({ password: PASSWORD }).expect(204);

    await agent.get('/api/auth/me').expect(401);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user!.id))).toHaveLength(0);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
    expect(await db.select().from(subscriptionPrices)).toHaveLength(0);
  });
});
