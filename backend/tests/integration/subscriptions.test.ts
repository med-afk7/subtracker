import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { subscriptionPrices, subscriptions, users } from '../../src/db/schema.js';
import { todayIn } from '../../src/domain/plainDate.js';
import { resetDatabase } from '../helpers/db.js';
import { createSubscription, netflix } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

const priceHistory = (subscriptionId: string) =>
  db
    .select({
      amountMinor: subscriptionPrices.amountMinor,
      currency: subscriptionPrices.currency,
      effectiveDate: subscriptionPrices.effectiveDate,
      source: subscriptionPrices.source,
    })
    .from(subscriptionPrices)
    .where(eq(subscriptionPrices.subscriptionId, subscriptionId))
    .orderBy(asc(subscriptionPrices.effectiveDate), asc(subscriptionPrices.recordedAt));

describe('categories', () => {
  it('lists the predefined categories', async () => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent.get('/api/categories').expect(200);
    expect(res.body.data.map((c: { slug: string }) => c.slug)).toEqual([
      'entertainment',
      'productivity',
      'health-fitness',
      'cloud-services',
      'education',
      'utilities',
      'other',
    ]);
  });
});

describe('creating subscriptions', () => {
  it('stores the price in minor units and returns it as a decimal string', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);

    expect(sub).toMatchObject({
      name: 'Netflix',
      category: { slug: 'entertainment', name: 'Entertainment' },
      amount: '15.99',
      currency: 'USD',
      billingInterval: 'month',
      billingIntervalCount: 1,
      state: 'active',
      reminderMode: 'default',
      reminderDaysBefore: null,
    });
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row?.amountMinor).toBe(1599);
  });

  it('computes the next billing date from the anchor in the user’s timezone', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    const today = todayIn('UTC');
    // Monthly on the 31st, clamped to the month end: the next one is on or after today
    expect(sub.nextBillingDate! >= today).toBe(true);
    expect(String(sub.nextBillingDate)).toMatch(/-(28|29|30|31)$/);
  });

  it('uses nextBillingDate as the anchor when given', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, {
      startDate: '2026-01-10',
      nextBillingDate: '2099-03-15',
    });
    expect(sub.nextBillingDate).toBe('2099-03-15');
  });

  it('respects each currency’s decimals', async () => {
    const agent = await signedInAgent('ada@example.com');
    const yen = await createSubscription(agent, { amount: '1500', currency: 'jpy' });
    expect(yen).toMatchObject({ amount: '1500', currency: 'JPY' });

    const res = await agent
      .post('/api/subscriptions')
      .send(netflix({ amount: '1500.5', currency: 'JPY' }))
      .expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'amount', message: "JPY amounts can't have decimals" },
    ]);
  });

  it('records the starting price as the first history entry', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    expect(await priceHistory(sub.id)).toEqual([
      { amountMinor: 1599, currency: 'USD', effectiveDate: '2026-01-31', source: 'initial' },
    ]);
  });

  it.each([
    ['missing name', { name: '  ' }, 'name'],
    ['invalid date', { startDate: '2026-02-30' }, 'startDate'],
    ['unknown currency', { currency: 'XYZ' }, 'currency'],
    ['too many decimals', { amount: '9.999' }, 'amount'],
    ['negative amount', { amount: '-1' }, 'amount'],
    ['amount as a float', { amount: 9.99 }, 'amount'],
    ['unsupported interval', { billingInterval: 'day' }, 'billingInterval'],
    ['interval count too big', { billingIntervalCount: 30 }, 'billingIntervalCount'],
    ['next billing before start', { nextBillingDate: '2026-01-01' }, 'nextBillingDate'],
    ['end before start', { endDate: '2025-12-31' }, 'endDate'],
    ['custom reminder without days', { reminderMode: 'custom' }, 'reminderDaysBefore'],
    ['non-http link', { cancellationUrl: 'javascript:alert(1)' }, 'cancellationUrl'],
    ['card number as label', { paymentMethodLabel: '4111 1111 1111 1111' }, 'paymentMethodLabel'],
    ['control characters in name', { name: 'Net\nflix' }, 'name'],
    ['control characters in label', { paymentMethodLabel: 'Visa\u0007' }, 'paymentMethodLabel'],
    ['unknown category', { category: 'gaming' }, 'category'],
  ])('rejects %s', async (_case, overrides, path) => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent.post('/api/subscriptions').send(netflix(overrides)).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
  });
});

describe('updating subscriptions', () => {
  it('records a price change in history and updates the current price together', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);

    const res = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '17.99' })
      .expect(200);
    expect(res.body.data.amount).toBe('17.99');

    const history = await priceHistory(sub.id);
    expect(history.map((p) => [p.amountMinor, p.source])).toEqual([
      [1599, 'initial'],
      [1799, 'manual_update'],
    ]);
    expect(history[1]?.effectiveDate).toBe(todayIn('UTC'));
  });

  it('keeps the latest price current when a back-dated change is recorded', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    await agent.patch(`/api/subscriptions/${sub.id}`).send({ amount: '19.99' }).expect(200);

    // Learned today about an older increase: it goes into history, but 19.99 stays current
    const res = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '17.99', priceEffectiveDate: '2026-06-01' })
      .expect(200);
    expect(res.body.data.amount).toBe('19.99');
    expect((await priceHistory(sub.id)).map((p) => p.amountMinor)).toEqual([1599, 1799, 1999]);
  });

  it('does not write history when the price is unchanged', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    await agent.patch(`/api/subscriptions/${sub.id}`).send({ amount: '15.99', name: 'Netflix HD' });
    expect(await priceHistory(sub.id)).toHaveLength(1);
  });

  it('requires an amount when the currency changes', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    const res = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ currency: 'CAD' })
      .expect(400);
    expect(res.body.error.details[0].path).toBe('amount');

    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ currency: 'CAD', amount: '21.99' })
      .expect(200);
    expect((await priceHistory(sub.id)).at(-1)).toMatchObject({
      amountMinor: 2199,
      currency: 'CAD',
    });
  });

  it('rejects future-dated price changes for now', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '17.99', priceEffectiveDate: '2099-01-01' })
      .expect(400);
    expect(await priceHistory(sub.id)).toHaveLength(1);
  });

  it('serializes concurrent price changes so history and current price agree', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);

    await Promise.all(
      ['16.99', '17.99', '18.99'].map((amount) =>
        agent.patch(`/api/subscriptions/${sub.id}`).send({ amount }).expect(200),
      ),
    );

    const history = await priceHistory(sub.id);
    expect(history).toHaveLength(4);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row?.amountMinor).toBe(history.at(-1)?.amountMinor);
  });

  it('requires a new next billing date when the billing frequency changes', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);

    const res = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ billingInterval: 'year' })
      .expect(422);
    expect(res.body.error.code).toBe('NEXT_BILLING_DATE_REQUIRED');

    const ok = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ billingInterval: 'year', nextBillingDate: '2099-05-01' })
      .expect(200);
    expect(ok.body.data).toMatchObject({ billingInterval: 'year', nextBillingDate: '2099-05-01' });
  });

  it('clears optional fields with null or empty strings', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, {
      notes: 'Family plan',
      providerWebsite: 'https://netflix.com',
    });
    const res = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ notes: '', providerWebsite: null })
      .expect(200);
    expect(res.body.data).toMatchObject({ notes: null, providerWebsite: null });
  });
});

describe('lifecycle', () => {
  it('cancel -> archive -> unarchive -> reactivate', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    const action = (name: string, body = {}) =>
      agent.post(`/api/subscriptions/${sub.id}/${name}`).send(body);

    const cancelled = await action('cancel', { endDate: '2026-12-31' }).expect(200);
    expect(cancelled.body.data).toMatchObject({
      state: 'cancelled',
      nextBillingDate: null,
      endDate: '2026-12-31',
      cancelledAt: expect.any(String),
    });

    expect((await action('archive').expect(200)).body.data.state).toBe('archived');
    expect((await action('unarchive').expect(200)).body.data.state).toBe('cancelled');

    const reactivated = await action('reactivate', { nextBillingDate: '2099-02-01' }).expect(200);
    expect(reactivated.body.data).toMatchObject({
      state: 'active',
      cancelledAt: null,
      endDate: null,
      nextBillingDate: '2099-02-01',
    });
  });

  it('refuses transitions that make no sense, with 409', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);

    const archive = await agent.post(`/api/subscriptions/${sub.id}/archive`).expect(409);
    expect(archive.body.error.message).toBe('Cancel the subscription before archiving it');
    await agent.post(`/api/subscriptions/${sub.id}/unarchive`).expect(409);
    await agent
      .post(`/api/subscriptions/${sub.id}/reactivate`)
      .send({ nextBillingDate: '2099-01-01' })
      .expect(409);
  });

  it('requires a next billing date to reactivate', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    await agent.post(`/api/subscriptions/${sub.id}/cancel`).expect(200);
    await agent.post(`/api/subscriptions/${sub.id}/reactivate`).send({}).expect(400);
  });

  it('delete removes the subscription and its history', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent);
    await agent.delete(`/api/subscriptions/${sub.id}`).expect(204);
    await agent.get(`/api/subscriptions/${sub.id}`).expect(404);
    expect(await priceHistory(sub.id)).toHaveLength(0);
  });
});

describe('listing', () => {
  async function seed() {
    const agent = await signedInAgent('ada@example.com');
    const make = (overrides: Record<string, unknown>) => createSubscription(agent, overrides);
    await make({ name: 'Spotify', amount: '10.99', nextBillingDate: '2099-01-05' });
    await make({ name: 'Netflix', amount: '15.99', nextBillingDate: '2099-01-20' });
    await make({
      name: 'iCloud',
      category: 'cloud-services',
      amount: '2.99',
      nextBillingDate: '2099-01-10',
    });
    await make({
      name: 'Domain',
      category: 'utilities',
      amount: '12',
      billingInterval: 'year',
      nextBillingDate: '2099-06-01',
    });
    const gym = await make({
      name: 'Gym 50% off',
      category: 'health-fitness',
      amount: '30',
      nextBillingDate: '2099-01-01',
    });
    await agent.post(`/api/subscriptions/${gym.id}/cancel`).expect(200);
    const old = await make({ name: 'Old magazine', amount: '5' });
    await agent.post(`/api/subscriptions/${old.id}/cancel`).expect(200);
    await agent.post(`/api/subscriptions/${old.id}/archive`).expect(200);
    return agent;
  }
  const names = (res: request.Response) => res.body.data.map((s: { name: string }) => s.name);

  it('sorts by next billing date by default, cancelled last, archived hidden', async () => {
    const agent = await seed();
    const res = await agent.get('/api/subscriptions').expect(200);
    expect(names(res)).toEqual(['Spotify', 'iCloud', 'Netflix', 'Domain', 'Gym 50% off']);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
  });

  it('filters by state, category and interval', async () => {
    const agent = await seed();
    expect(names(await agent.get('/api/subscriptions?state=archived'))).toEqual(['Old magazine']);
    expect(names(await agent.get('/api/subscriptions?state=cancelled'))).toEqual(['Gym 50% off']);
    expect(names(await agent.get('/api/subscriptions?category=cloud-services'))).toEqual([
      'iCloud',
    ]);
    expect(names(await agent.get('/api/subscriptions?interval=year'))).toEqual(['Domain']);
  });

  it('searches by name, treating % and _ literally', async () => {
    const agent = await seed();
    expect(names(await agent.get('/api/subscriptions?search=FLIX'))).toEqual(['Netflix']);
    expect(names(await agent.get('/api/subscriptions?search=50%25'))).toEqual(['Gym 50% off']);
    expect(names(await agent.get('/api/subscriptions?search=%25'))).toEqual(['Gym 50% off']);
  });

  it('sorts by name and by price', async () => {
    const agent = await seed();
    expect(names(await agent.get('/api/subscriptions?sort=name'))).toEqual([
      'Domain',
      'Gym 50% off',
      'iCloud',
      'Netflix',
      'Spotify',
    ]);
    expect(names(await agent.get('/api/subscriptions?sort=amount&order=desc'))).toEqual([
      'Gym 50% off',
      'Netflix',
      'Domain',
      'Spotify',
      'iCloud',
    ]);
  });

  it('paginates without overlap', async () => {
    const agent = await seed();
    const page1 = await agent.get('/api/subscriptions?sort=name&limit=2&page=1').expect(200);
    const page3 = await agent.get('/api/subscriptions?sort=name&limit=2&page=3').expect(200);
    expect(names(page1)).toEqual(['Domain', 'Gym 50% off']);
    expect(names(page3)).toEqual(['Spotify']);
    expect(page3.body.pagination).toEqual({ page: 3, limit: 2, total: 5, totalPages: 3 });
  });

  it('validates query parameters', async () => {
    const agent = await signedInAgent('ada@example.com');
    await agent.get('/api/subscriptions?limit=500').expect(400);
    await agent.get('/api/subscriptions?sort=price').expect(400);
    await agent.get('/api/subscriptions?page=0').expect(400);
  });

  it('moves a stale cached next billing date forward before sorting', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, { startDate: '2020-01-15' });
    await db
      .update(subscriptions)
      .set({ nextBillingDate: '2020-01-15' })
      .where(eq(subscriptions.id, sub.id));

    await agent.get('/api/subscriptions').expect(200);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row!.nextBillingDate! >= todayIn('UTC')).toBe(true);
  });
});

describe('details', () => {
  it('includes the next three billing dates for active subscriptions', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, {
      startDate: '2026-01-31',
      nextBillingDate: '2099-01-31',
    });
    const res = await agent.get(`/api/subscriptions/${sub.id}`).expect(200);
    expect(res.body.data.upcomingBillingDates).toEqual(['2099-01-31', '2099-02-28', '2099-03-31']);
  });

  it('uses the user’s timezone to decide what today is', async () => {
    const agent = await signedInAgent('ada@example.com');
    await agent.patch('/api/account').send({ timezone: 'Pacific/Kiritimati' }).expect(200); // UTC+14
    const today = todayIn('Pacific/Kiritimati');
    const sub = await createSubscription(agent, {
      startDate: '2026-01-01',
      billingInterval: 'week',
    });
    expect(sub.nextBillingDate! >= today).toBe(true);
    const user = await db.query.users.findFirst({ where: eq(users.email, 'ada@example.com') });
    expect(user?.timezone).toBe('Pacific/Kiritimati');
  });
});

describe('ownership', () => {
  it('another user can’t see, change, cancel or delete a subscription by its id', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    const sub = await createSubscription(ada);
    const url = `/api/subscriptions/${sub.id}`;

    expect((await bob.get('/api/subscriptions').expect(200)).body.data).toEqual([]);
    await bob.get(url).expect(404);
    await bob.patch(url).send({ amount: '0' }).expect(404);
    await bob.post(`${url}/cancel`).expect(404);
    await bob.post(`${url}/archive`).expect(404);
    await bob.post(`${url}/reactivate`).send({ nextBillingDate: '2099-01-01' }).expect(404);
    await bob.delete(url).expect(404);

    // Ada's subscription and history are untouched
    const mine = await ada.get(url).expect(200);
    expect(mine.body.data).toMatchObject({ amount: '15.99', state: 'active' });
    expect(await priceHistory(sub.id)).toHaveLength(1);
  });

  it('a malformed id is a 404 too', async () => {
    const agent = await signedInAgent('ada@example.com');
    const res = await agent.get('/api/subscriptions/123').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('service presets', () => {
  it('stores the preset a subscription was created from and returns it everywhere', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, { service: 'netflix', startDate: '2099-01-10' });
    expect(sub.service).toBe('netflix');

    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.data.service).toBe('netflix');
    const calendar = await agent.get('/api/calendar?from=2099-01-01&to=2099-01-31').expect(200);
    expect(calendar.body.data.events[0].service).toBe('netflix');

    // Editing other fields keeps it; null clears it
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ name: 'Netflix (family)' })
      .expect(200);
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.data.service).toBe('netflix');
    const cleared = await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ service: null })
      .expect(200);
    expect(cleared.body.data.service).toBeNull();
  });

  it('defaults to no service and rejects malformed values', async () => {
    const agent = await signedInAgent('ada@example.com');
    expect((await createSubscription(agent)).service).toBeNull();
    for (const service of ['Netflix', '../logo', 'a'.repeat(41), '']) {
      await agent.post('/api/subscriptions').send(netflix({ service })).expect(400);
    }
  });
});
