import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { runDispatcher } from '../../src/jobs/dispatcher.js';
import { runScheduler } from '../../src/jobs/scheduler.js';
import { logger } from '../../src/lib/logger.js';
import { resetDatabase } from '../helpers/db.js';
import { fakeEmailSender } from '../helpers/email.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

describe('notification preferences', () => {
  it('reads and updates the account-wide settings', async () => {
    const agent = await signedInAgent('ada@example.com');
    expect((await agent.get('/api/notification-preferences').expect(200)).body.data).toEqual({
      remindersEnabled: true,
      defaultReminderDaysBefore: 3,
    });

    const res = await agent
      .patch('/api/notification-preferences')
      .send({ defaultReminderDaysBefore: 7 })
      .expect(200);
    expect(res.body.data).toEqual({ remindersEnabled: true, defaultReminderDaysBefore: 7 });

    await agent
      .patch('/api/notification-preferences')
      .send({ defaultReminderDaysBefore: 31 })
      .expect(400);
    await agent
      .patch('/api/notification-preferences')
      .send({ remindersEnabled: 'yes' })
      .expect(400);
  });
});

describe('reminder history', () => {
  it('lists the user’s own reminders only', async () => {
    const ada = await signedInAgent('ada@example.com');
    const bob = await signedInAgent('bob@example.com');
    await createSubscription(ada, { startDate: '2099-01-01', nextBillingDate: '2099-03-10' });
    // Scheduler + dispatcher only: a full tick in 2099 would also expire today's sessions
    const due = new Date('2099-03-07T09:00:00Z');
    await runScheduler(due);
    await runDispatcher(due, fakeEmailSender, logger);

    const mine = await ada.get('/api/notifications').expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({
      subscriptionName: 'Netflix',
      billingDate: '2099-03-10',
      status: 'sent',
      attemptCount: 1,
    });
    expect(mine.body.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect((await bob.get('/api/notifications').expect(200)).body.data).toEqual([]);
  });
});

describe('scheduled trigger', () => {
  const SECRET = 'test-cron-secret-that-is-at-least-32-characters';

  it('rejects a missing or wrong secret', async () => {
    await request(app).post('/api/internal/tick').expect(401);
    await request(app).post('/api/internal/tick').set('Authorization', 'Bearer wrong').expect(401);
  });

  it('runs a tick with the right secret', async () => {
    const res = await request(app)
      .post('/api/internal/tick')
      .set('Authorization', `Bearer ${SECRET}`)
      .expect(200);
    expect(res.body.data).toMatchObject({
      maintenance: expect.any(Object),
      scheduler: { scheduled: 0 },
      dispatcher: { claimed: 0, sent: 0 },
    });
  });
});
