import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayIn } from '../../src/domain/plainDate.js';
import { resetDatabase } from '../helpers/db.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

// Test users are in UTC, so "today" is today's UTC date
const today = () => todayIn('UTC');
const inDays = (n: number) => addDays(today(), n);

describe('dashboard summary', () => {
  it('is empty for a new user', async () => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent.get('/api/dashboard/summary').expect(200);
    expect(res.body.data).toEqual({
      activeCount: 0,
      totals: [],
      upcoming: [],
      upcomingWindowDays: 30,
      recentPriceChanges: [],
    });
  });

  it('totals monthly-equivalent and annualized costs per currency', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, { name: 'Netflix', amount: '15.99' });
    await createSubscription(agent, { name: 'Domain', amount: '120', billingInterval: 'year' });
    await createSubscription(agent, {
      name: 'Lunch box',
      amount: '10',
      currency: 'CAD',
      billingInterval: 'week',
    });

    const { body } = await agent.get('/api/dashboard/summary').expect(200);
    expect(body.data.activeCount).toBe(3);
    expect(body.data.totals).toEqual([
      // 15.99 + 120/12 = 25.99 a month; 191.88 + 120 = 311.88 a year
      { currency: 'USD', subscriptionCount: 2, monthlyEquivalent: '25.99', annualized: '311.88' },
      // 10 x 52 / 12 = 43.333... -> 43.33
      { currency: 'CAD', subscriptionCount: 1, monthlyEquivalent: '43.33', annualized: '520.00' },
    ]);
  });

  it('leaves out cancelled and archived subscriptions', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, { name: 'Netflix' });
    const cancelled = await createSubscription(agent, { name: 'Gym', amount: '50' });
    const archived = await createSubscription(agent, { name: 'Magazine', amount: '5' });
    await agent.post(`/api/subscriptions/${cancelled.id}/cancel`).expect(200);
    await agent.post(`/api/subscriptions/${archived.id}/cancel`).expect(200);
    await agent.post(`/api/subscriptions/${archived.id}/archive`).expect(200);

    const { body } = await agent.get('/api/dashboard/summary').expect(200);
    expect(body.data.activeCount).toBe(1);
    expect(body.data.totals[0].monthlyEquivalent).toBe('15.99');
    expect(body.data.upcoming.map((p: { name: string }) => p.name)).not.toContain('Gym');
  });

  it('lists every expected charge in the next 30 days, in date order', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, {
      name: 'Soon',
      startDate: today(),
      nextBillingDate: inDays(5),
    });
    await createSubscription(agent, {
      name: 'Later',
      startDate: today(),
      nextBillingDate: inDays(45),
    });
    await createSubscription(agent, {
      name: 'Coffee club',
      amount: '4.50',
      billingInterval: 'week',
      startDate: today(),
    });

    const { body } = await agent.get('/api/dashboard/summary').expect(200);
    expect(body.data.upcoming.map((p: { name: string; date: string }) => [p.date, p.name])).toEqual(
      [
        [inDays(0), 'Coffee club'],
        [inDays(5), 'Soon'],
        [inDays(7), 'Coffee club'],
        [inDays(14), 'Coffee club'],
        [inDays(21), 'Coffee club'],
        [inDays(28), 'Coffee club'],
      ],
    );
    expect(body.data.upcoming[0]).toMatchObject({
      amount: '4.50',
      currency: 'USD',
      status: 'expected',
    });
  });

  it('reports recent price changes with the previous price', async () => {
    const agent = await signedInAgent('ada@example.com');
    const netflix = await createSubscription(agent, { name: 'Netflix', startDate: '2020-01-01' });
    await agent.patch(`/api/subscriptions/${netflix.id}`).send({ amount: '17.99' }).expect(200);

    const spotify = await createSubscription(agent, {
      name: 'Spotify',
      amount: '9.99',
      startDate: '2020-01-01',
    });
    // A change that took effect long ago is history, not "recent"
    await agent
      .patch(`/api/subscriptions/${spotify.id}`)
      .send({ amount: '10.99', priceEffectiveDate: '2021-06-01' })
      .expect(200);

    const moved = await createSubscription(agent, { name: 'Moved', startDate: '2020-01-01' });
    await agent
      .patch(`/api/subscriptions/${moved.id}`)
      .send({ amount: '21.99', currency: 'CAD' })
      .expect(200);

    const { body } = await agent.get('/api/dashboard/summary').expect(200);
    const changes = body.data.recentPriceChanges;
    expect(changes).toHaveLength(2);
    expect(changes.find((c: { name: string }) => c.name === 'Netflix')).toEqual({
      subscriptionId: netflix.id,
      name: 'Netflix',
      effectiveDate: today(),
      previousAmount: '15.99',
      newAmount: '17.99',
      currency: 'USD',
      difference: '+2.00',
    });
    // Different currencies can't be subtracted
    expect(changes.find((c: { name: string }) => c.name === 'Moved')).toMatchObject({
      previousAmount: '15.99',
      newAmount: '21.99',
      currency: 'CAD',
      difference: null,
    });
  });

  it('only includes the current user’s subscriptions', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    await createSubscription(ada, { name: 'Netflix' });

    const { body } = await bob.get('/api/dashboard/summary').expect(200);
    expect(body.data.activeCount).toBe(0);
    expect(body.data.totals).toEqual([]);
  });
});

describe('category breakdown', () => {
  it('ranks categories by monthly-equivalent spend within each currency', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, {
      name: 'Netflix',
      category: 'entertainment',
      amount: '15.99',
    });
    await createSubscription(agent, {
      name: 'Spotify',
      category: 'entertainment',
      amount: '10.99',
    });
    await createSubscription(agent, { name: 'iCloud', category: 'cloud-services', amount: '2.99' });
    await createSubscription(agent, {
      name: 'Course',
      category: 'education',
      amount: '360',
      billingInterval: 'year',
    });
    await createSubscription(agent, {
      name: 'Bank',
      category: 'utilities',
      amount: '5',
      currency: 'CAD',
    });

    const { body } = await agent.get('/api/dashboard/category-breakdown').expect(200);
    const [usd, cad] = body.data;

    expect(usd).toMatchObject({
      currency: 'USD',
      subscriptionCount: 4,
      monthlyEquivalent: '59.97',
    });
    expect(
      usd.categories.map((c: { slug: string; monthlyEquivalent: string }) => [
        c.slug,
        c.monthlyEquivalent,
      ]),
    ).toEqual([
      ['education', '30.00'],
      ['entertainment', '26.98'],
      ['cloud-services', '2.99'],
    ]);
    expect(usd.categories[1]).toMatchObject({ name: 'Entertainment', subscriptionCount: 2 });
    const shares = usd.categories.map((c: { share: number }) => c.share);
    expect(shares.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1, 2);

    expect(cad).toMatchObject({ currency: 'CAD', monthlyEquivalent: '5.00' });
  });

  it('requires authentication', async () => {
    const { default: request } = await import('supertest');
    const { default: app } = await import('../../src/app.js');
    await request(app).get('/api/dashboard/category-breakdown').expect(401);
    await request(app).get('/api/dashboard/summary').expect(401);
  });
});
