import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import type { LifecycleAction } from '../../domain/lifecycle.js';
import { notFound } from '../../lib/errors.js';
import * as subscriptionsService from '../../services/subscriptions.service.js';
import { currentAuth } from '../middleware/requireAuth.js';
import {
  cancelSchema,
  createSubscriptionSchema,
  listQuerySchema,
  reactivateSchema,
  updateSubscriptionSchema,
} from '../schemas/subscriptions.schemas.js';

// A malformed id gets the same 404 as someone else's id: either way there's nothing to see
function subscriptionId(req: Request): string {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw notFound('Subscription');
  return parsed.data;
}

const context = (req: Request): subscriptionsService.RequestContext => {
  const { userId, timezone } = currentAuth(req);
  return { userId, timezone };
};

export const listCategories: RequestHandler = async (_req, res) => {
  res.status(200).json({ data: await subscriptionsService.listCategories() });
};

export const listSubscriptions: RequestHandler = async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.status(200).json(await subscriptionsService.listSubscriptions(context(req), query));
};

export const getSubscription: RequestHandler = async (req, res) => {
  const data = await subscriptionsService.getSubscription(context(req), subscriptionId(req));
  res.status(200).json({ data });
};

export const createSubscription: RequestHandler = async (req, res) => {
  const input = createSubscriptionSchema.parse(req.body);
  const data = await subscriptionsService.createSubscription(context(req), input);
  req.log.info({ subscriptionId: data.id }, 'Subscription created');
  res.status(201).json({ data });
};

export const updateSubscription: RequestHandler = async (req, res) => {
  const id = subscriptionId(req);
  const patch = updateSubscriptionSchema.parse(req.body);
  const data = await subscriptionsService.updateSubscription(context(req), id, patch);
  req.log.info({ subscriptionId: id, fields: Object.keys(patch) }, 'Subscription updated');
  res.status(200).json({ data });
};

export const deleteSubscription: RequestHandler = async (req, res) => {
  const id = subscriptionId(req);
  await subscriptionsService.deleteSubscription(context(req), id);
  req.log.info({ subscriptionId: id }, 'Subscription deleted');
  res.status(204).end();
};

// POST /:id/cancel | reactivate | archive | unarchive
const lifecycleHandler =
  (action: LifecycleAction): RequestHandler =>
  async (req, res) => {
    const id = subscriptionId(req);
    const options =
      action === 'cancel'
        ? cancelSchema.parse(req.body ?? {})
        : action === 'reactivate'
          ? reactivateSchema.parse(req.body ?? {})
          : {};
    const data = await subscriptionsService.applyLifecycleAction(context(req), id, action, options);
    req.log.info({ subscriptionId: id, action }, 'Subscription lifecycle change');
    res.status(200).json({ data });
  };

export const cancelSubscription = lifecycleHandler('cancel');
export const reactivateSubscription = lifecycleHandler('reactivate');
export const archiveSubscription = lifecycleHandler('archive');
export const unarchiveSubscription = lifecycleHandler('unarchive');

export const getPriceHistory: RequestHandler = async (req, res) => {
  const data = await subscriptionsService.getPriceHistory(context(req), subscriptionId(req));
  res.status(200).json({ data });
};
