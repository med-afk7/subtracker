import type { RequestHandler } from 'express';
import * as notificationsService from '../../services/notifications.service.js';
import { currentUserId } from '../middleware/requireAuth.js';
import { deliveriesQuerySchema, preferencesSchema } from '../schemas/notifications.schemas.js';

export const getPreferences: RequestHandler = async (req, res) => {
  res.status(200).json({ data: await notificationsService.getPreferences(currentUserId(req)) });
};

export const updatePreferences: RequestHandler = async (req, res) => {
  const changes = preferencesSchema.parse(req.body);
  const data = await notificationsService.updatePreferences(currentUserId(req), changes);
  res.status(200).json({ data });
};

export const listDeliveries: RequestHandler = async (req, res) => {
  const { page, limit } = deliveriesQuerySchema.parse(req.query);
  res.status(200).json(await notificationsService.listDeliveries(currentUserId(req), page, limit));
};
