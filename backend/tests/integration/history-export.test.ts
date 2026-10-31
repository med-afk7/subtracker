import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { addMonthsClamped, todayIn } from '../../src/domain/plainDate.js';
import { resetDatabase } from '../helpers/db.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

describe('price history', () => {
  it('lists every price newest first with the change from the previous one', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, {
      name: 'Spotify',
      amount: '9.99',
      startDate: '2026-01-10',
    });
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '12.99', priceEffectiveDate: '2026-06-01' });
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '14.99', priceEffectiveDate: '2026-10-01' });

    const res = await agent.get(`/api/subscriptions/${sub.id}/history`).expect(200);
    expect(
      res.body.data.entries.map(
        (e: { effectiveDate: string; amount: string; difference: string | null }) => [
          e.effectiveDate,
          e.amount,
          e.difference,
        ],
      ),
    ).toEqual([
      ['2026-10-01', '14.99', '+2.00'],
      ['2026-06-01', '12.99', '+3.00'],
      ['2026-01-10', '9.99', null],
    ]);
    expect(res.body.data.entries.at(-1)).toMatchObject({ source: 'initial', previousAmount: null });
    // "The price increased by 5.00 from January to October"
    expect(res.body.data.overall).toEqual({
      from: { amount: '9.99', currency: 'USD', effectiveDate: '2026-01-10' },
      to: { amount: '14.99', currency: 'USD', effectiveDate: '2026-10-01' },
      difference: '+5.00',
    });
  });

  it('has no overall change for a single price, and none across currencies', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, { startDate: '2026-01-10' });
    expect((await agent.get(`/api/subscriptions/${sub.id}/history`)).body.data.overall).toBeNull();

    await agent.patch(`/api/subscriptions/${sub.id}`).send({ amount: '21.99', currency: 'CAD' });
    const res = await agent.get(`/api/subscriptions/${sub.id}/history`).expect(200);
    expect(res.body.data.overall.difference).toBeNull();
    expect(res.body.data.entries[0]).toMatchObject({
      amount: '21.99',
      currency: 'CAD',
      previousAmount: '15.99',
      difference: null,
    });
  });

  it('is private to the owner', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    const sub = await createSubscription(ada);
    await bob.get(`/api/subscriptions/${sub.id}/history`).expect(404);
  });
});

describe('CSV export', () => {
  const lines = (res: request.Response) =>
    res.text
      .replace(/^\uFEFF/, '')
      .split('\r\n')
      .filter(Boolean);

  it('downloads the user’s subscriptions as a CSV attachment', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, {
      name: 'Netflix',
      notes: 'Family plan, 4 screens',
      paymentMethodLabel: 'Visa ending 1234',
      startDate: '2026-01-31',
      nextBillingDate: '2099-01-31',
    });
    const yearly = await createSubscription(agent, {
      name: 'Domain',
      category: 'utilities',
      amount: '12',
      billingInterval: 'year',
      startDate: '2025-05-01',
    });
    await agent.post(`/api/subscriptions/${yearly.id}/cancel`).expect(200);

    const res = await agent.get('/api/subscriptions/export').expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="subtracker-subscriptions-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text.startsWith('\uFEFF')).toBe(true);

    const [header, ...rows] = lines(res);
    expect(header).toBe(
      'Name,Category,Price,Currency,Billing frequency,Next billing date,Status,Start date,End date,Payment method,Notes,Created at',
    );
    expect(rows[0]).toBe(
      'Domain,Utilities,12.00,USD,annually,,cancelled,2025-05-01,,,,' + rows[0]!.split(',').at(-1),
    );
    expect(rows[1]).toMatch(
      /^Netflix,Entertainment,15\.99,USD,monthly,2099-01-31,active,2026-01-31,,Visa ending 1234,"Family plan, 4 screens",\d{4}-/,
    );
    // No internal identifiers
    expect(res.text).not.toContain(yearly.id);
  });

  it('neutralizes spreadsheet formulas in user-entered text', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, {
      name: '=HYPERLINK("http://evil.example","Click")',
      notes: '+1 extra',
    });

    const [, row] = lines(await agent.get('/api/subscriptions/export').expect(200));
    expect(row).toMatch(/^"'=HYPERLINK\(""http:\/\/evil\.example"",""Click""\)",/);
    expect(row).toContain(",'+1 extra,");
  });

  it('exports price history', async () => {
    const agent = await signedInAgent('ada@example.com');
    const sub = await createSubscription(agent, {
      name: 'Spotify',
      amount: '9.99',
      startDate: '2026-01-10',
    });
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '12.99', priceEffectiveDate: '2026-06-01' });

    const res = await agent.get('/api/subscriptions/export?type=price-history').expect(200);
    expect(res.headers['content-disposition']).toMatch(/subtracker-price-history-/);
    const [header, first, second] = lines(res);
    expect(header).toBe('Subscription,Effective date,Price,Currency,Recorded at,Source');
    expect(first).toMatch(/^Spotify,2026-01-10,9\.99,USD,.+,starting price$/);
    expect(second).toMatch(/^Spotify,2026-06-01,12\.99,USD,.+,manual update$/);
  });

  it('contains only the requester’s data and needs a login', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    await createSubscription(ada, { name: 'Ada secret plan' });

    const bobs = await bob.get('/api/subscriptions/export').expect(200);
    expect(bobs.text).not.toContain('Ada secret plan');
    expect(lines(bobs)).toHaveLength(1); // header only
    await request(app).get('/api/subscriptions/export').expect(401);
  });

  it('rejects an unknown export type', async () => {
    const agent = await signedInAgent('ada@example.com');
    await agent.get('/api/subscriptions/export?type=passwords').expect(400);
  });
});

describe('spending trends', () => {
  it('rebuilds the monthly-equivalent cost at each month end from the recorded history', async () => {
    const agent = await signedInAgent('ada@example.com');
    const today = todayIn('UTC');
    const firstOfMonth = `${today.slice(0, 7)}-01`;
    const monthsAgo = (n: number) => addMonthsClamped(firstOfMonth, -n);

    // Started 3 months ago at 10.00, rose to 13.00 at the start of last month
    const sub = await createSubscription(agent, {
      name: 'Spotify',
      amount: '10.00',
      startDate: monthsAgo(3),
    });
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ amount: '13.00', priceEffectiveDate: monthsAgo(1) });
    // A yearly plan that started 2 months ago
    await createSubscription(agent, {
      name: 'Domain',
      amount: '120',
      billingInterval: 'year',
      startDate: monthsAgo(2),
    });

    const res = await agent.get('/api/dashboard/spending-trends?months=6').expect(200);
    const series = res.body.data.points.map(
      (p: { month: string; totals: { monthlyEquivalent: string }[] }) => [
        p.month,
        p.totals[0]?.monthlyEquivalent ?? null,
      ],
    );
    expect(series).toEqual([
      [monthsAgo(3).slice(0, 7), '10.00'],
      [monthsAgo(2).slice(0, 7), '20.00'], // + 120 / 12
      [monthsAgo(1).slice(0, 7), '23.00'], // price rise
      [today.slice(0, 7), '23.00'],
    ]);
    expect(res.body.data.points.at(-1).date).toBe(today);
  });

  it('is empty without subscriptions and validates the range', async () => {
    const agent = await signedInAgent('ada@example.com');
    expect((await agent.get('/api/dashboard/spending-trends').expect(200)).body.data).toEqual({
      points: [],
      months: 12,
    });
    await agent.get('/api/dashboard/spending-trends?months=100').expect(400);
  });
});
