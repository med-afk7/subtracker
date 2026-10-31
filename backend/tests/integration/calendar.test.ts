import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { addDays, todayIn } from '../../src/domain/plainDate.js';
import { resetDatabase } from '../helpers/db.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

type Event = { date: string; name: string; amount: string; currency: string; isPast: boolean };
const summary = (events: Event[]) => events.map((e) => `${e.date} ${e.name} ${e.amount}`);

describe('billing calendar', () => {
  it('lists expected charges in the range with category and status', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, { name: 'Netflix', startDate: '2099-01-31' });
    await createSubscription(agent, {
      name: 'Gym',
      category: 'health-fitness',
      amount: '12',
      billingInterval: 'week',
      billingIntervalCount: 2,
      startDate: '2099-02-05',
    });

    const res = await agent.get('/api/calendar?from=2099-02-01&to=2099-03-31').expect(200);
    expect(summary(res.body.data.events)).toEqual([
      '2099-02-05 Gym 12.00',
      '2099-02-19 Gym 12.00',
      '2099-02-28 Netflix 15.99', // Jan 31 schedule clamps to Feb 28...
      '2099-03-05 Gym 12.00',
      '2099-03-19 Gym 12.00',
      '2099-03-31 Netflix 15.99', // ...and returns to the 31st
    ]);
    expect(res.body.data.events[0]).toMatchObject({
      category: { slug: 'health-fitness', name: 'Health and fitness' },
      currency: 'USD',
      status: 'expected',
      isPast: false,
    });
    expect(res.body.data.totals).toEqual([{ currency: 'USD', amount: '79.98', count: 6 }]);
  });

  it('prices past charges from the price history and upcoming ones at today’s price', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, {
      name: 'Spotify',
      amount: '10.00',
      startDate: '2025-01-15',
    });
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '12.00', priceEffectiveDate: '2025-04-01' })
      .expect(200);

    const past = await agent.get('/api/calendar?from=2025-02-01&to=2025-05-31').expect(200);
    expect(summary(past.body.data.events)).toEqual([
      '2025-02-15 Spotify 10.00',
      '2025-03-15 Spotify 10.00',
      '2025-04-15 Spotify 12.00',
      '2025-05-15 Spotify 12.00',
    ]);
    expect(past.body.data.events.every((e: Event) => e.isPast)).toBe(true);
    expect(past.body.data.totals).toEqual([{ currency: 'USD', amount: '44.00', count: 4 }]);
  });

  it('shows a cancelled subscription only before its cancellation', async () => {
    const agent = await signedInAgent('ada@example.com');
    const today = todayIn('UTC');
    const sub = await createSubscription(agent, {
      name: 'Old',
      billingInterval: 'week',
      startDate: addDays(today, -21),
    });
    await agent.post(`/api/subscriptions/${sub.id}/cancel`).expect(200);

    const res = await agent
      .get(`/api/calendar?from=${addDays(today, -30)}&to=${addDays(today, 30)}`)
      .expect(200);
    const dates = res.body.data.events.map((e: Event) => e.date);
    expect(dates).toEqual([addDays(today, -21), addDays(today, -14), addDays(today, -7)]);
  });

  it('hides archived subscriptions', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, { startDate: '2099-01-31' });
    await agent.post(`/api/subscriptions/${sub.id}/cancel`).expect(200);
    await agent.post(`/api/subscriptions/${sub.id}/archive`).expect(200);
    const res = await agent.get('/api/calendar?from=2099-01-01&to=2099-12-31').expect(200);
    expect(res.body.data.events).toEqual([]);
  });

  it('filters by category and by subscription', async () => {
    const agent = await signedInAgent('ada@example.com');
    const netflix = await createSubscription(agent, { name: 'Netflix', startDate: '2099-01-10' });
    await createSubscription(agent, {
      name: 'iCloud',
      category: 'cloud-services',
      startDate: '2099-01-20',
    });
    const range = 'from=2099-01-01&to=2099-01-31';

    const byCategory = await agent
      .get(`/api/calendar?${range}&category=cloud-services`)
      .expect(200);
    expect(byCategory.body.data.events.map((e: Event) => e.name)).toEqual(['iCloud']);
    const bySubscription = await agent
      .get(`/api/calendar?${range}&subscriptionId=${netflix.id}`)
      .expect(200);
    expect(bySubscription.body.data.events.map((e: Event) => e.name)).toEqual(['Netflix']);
  });

  it('keeps currencies apart in the totals', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, { name: 'A', amount: '10', startDate: '2099-01-10' });
    await createSubscription(agent, {
      name: 'B',
      amount: '1500',
      currency: 'JPY',
      startDate: '2099-01-12',
    });
    const res = await agent.get('/api/calendar?from=2099-01-01&to=2099-01-31').expect(200);
    expect(res.body.data.totals).toEqual([
      { currency: 'USD', amount: '10.00', count: 1 },
      { currency: 'JPY', amount: '1500', count: 1 },
    ]);
  });

  it.each([
    ['missing dates', ''],
    ['invalid date', 'from=2099-02-30&to=2099-03-01'],
    ['inverted range', 'from=2099-03-01&to=2099-02-01'],
    ['range over a year', 'from=2099-01-01&to=2100-01-03'],
    ['malformed subscription id', 'from=2099-01-01&to=2099-01-31&subscriptionId=123'],
  ])('rejects %s', async (_case, query) => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent.get(`/api/calendar?${query}`).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never shows another user’s subscriptions, even when asked by id', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    const sub = await createSubscription(ada, { startDate: '2099-01-10' });

    const range = 'from=2099-01-01&to=2099-01-31';
    expect((await bob.get(`/api/calendar?${range}`).expect(200)).body.data.events).toEqual([]);
    expect(
      (await bob.get(`/api/calendar?${range}&subscriptionId=${sub.id}`).expect(200)).body.data
        .events,
    ).toEqual([]);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/calendar?from=2099-01-01&to=2099-01-31').expect(401);
  });
});
