import { Router } from 'express';
import {
  getPreferences,
  listDeliveries,
  updatePreferences,
} from '../controllers/notifications.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);
preferencesRouter.get('/', getPreferences);
preferencesRouter.patch('/', updatePreferences);

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get('/', listDeliveries);
