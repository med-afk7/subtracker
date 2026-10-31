import type { Agent } from 'supertest';

// A valid body for POST /api/subscriptions; override any field
export const netflix = (overrides: Record<string, unknown> = {}) => ({
  name: 'Netflix',
  category: 'entertainment',
  amount: '15.99',
  currency: 'USD',
  billingInterval: 'month',
  startDate: '2026-01-31',
  ...overrides,
});

export async function createSubscription(agent: Agent, overrides: Record<string, unknown> = {}) {
  const res = await agent.post('/api/subscriptions').send(netflix(overrides)).expect(201);
  return res.body.data as { id: string; [key: string]: unknown };
}
