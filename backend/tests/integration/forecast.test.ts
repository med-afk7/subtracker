import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { addDays, addMonthsClamped, todayIn } from '../../src/domain/plainDate.js';
import { resetDatabase } from '../helpers/db.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

const today = () => todayIn('UTC');
type Month = { month: string; totals: { currency: string; amount: string; count: number }[] };
const usdByMonth = (months: Month[]) =>
  months.map((m) => [m.month, m.totals.find((t) => t.currency === 'USD')?.amount ?? '0']);

describe('forecast', () => {
  it('puts an annual payment in its renewal month, unlike the monthly equivalent', async () => {
    const agent = await signedInAgent('ada@example.com');
    const start = today();
    await createSubscription(agent, { name: 'Netflix', amount: '15.99', startDate: start });
    // Renews in 2 months: $120 lands in that month only
    const renewal = addMonthsClamped(start, 2);
    await createSubscription(agent, {
      name: 'Domain',
      amount: '120',
      billingInterval: 'year',
      startDate: start,
      nextBillingDate: renewal,
    });

    const res = await agent.get('/api/forecast?range=12m').expect(200);
    const { data } = res.body;
    expect(data).toMatchObject({
      range: '12m',
      from: start,
      to: addDays(addMonthsClamped(start, 12), -1),
    });
    expect(data.months).toHaveLength(12 + (start.endsWith('-01') ? 0 : 1));

    const renewalMonth = data.months.find((m: Month) => m.month === renewal.slice(0, 7));
    expect(renewalMonth.totals).toEqual([{ currency: 'USD', amount: '135.99', count: 2 }]);
    // 12 Netflix charges + 1 Domain renewal in the next 12 months
    expect(data.totals).toEqual([{ currency: 'USD', amount: '311.88', count: 13 }]);

    // The dashboard's monthly equivalent for the same subscriptions is flat: 15.99 + 120/12
    const summary = await agent.get('/api/dashboard/summary').expect(200);
    expect(summary.body.data.totals[0].monthlyEquivalent).toBe('25.99');
  });

  it('counts only charges inside the range', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, {
      name: 'Weekly',
      amount: '10',
      billingInterval: 'week',
      startDate: today(),
    });

    const thirty = (await agent.get('/api/forecast?range=30d').expect(200)).body.data;
    expect(thirty.to).toBe(addDays(today(), 29));
    expect(thirty.totals).toEqual([{ currency: 'USD', amount: '50.00', count: 5 }]); // days 0, 7, 14, 21, 28
    const ninety = (await agent.get('/api/forecast?range=90d').expect(200)).body.data;
    expect(ninety.totals[0].count).toBe(13); // days 0, 7, ..., 84
    expect(usdByMonth(ninety.months).reduce((sum, [, amount]) => sum + Number(amount), 0)).toBe(
      130,
    );
  });

  it('leaves out cancelled and archived subscriptions and keeps currencies apart', async () => {
    const agent = await signedInAgent('ada@example.com');
    await createSubscription(agent, { name: 'USD plan', startDate: today() });
    await createSubscription(agent, {
      name: 'Yen plan',
      amount: '1500',
      currency: 'JPY',
      startDate: today(),
    });
    const gone = await createSubscription(agent, { name: 'Gone', startDate: today() });
    await agent.post(`/api/subscriptions/${gone.id}/cancel`).expect(200);

    const { totals } = (await agent.get('/api/forecast?range=30d').expect(200)).body.data;
    expect(totals).toEqual([
      { currency: 'USD', amount: '15.99', count: 1 },
      { currency: 'JPY', amount: '1500', count: 1 },
    ]);
  });

  it('defaults to 90 days, validates the range, and is private', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    await createSubscription(ada, { startDate: today() });

    expect((await ada.get('/api/forecast').expect(200)).body.data.range).toBe('90d');
    await ada.get('/api/forecast?range=5y').expect(400);
    expect((await bob.get('/api/forecast').expect(200)).body.data.totals).toEqual([]);
    await request(app).get('/api/forecast').expect(401);
  });
});
