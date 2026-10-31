import type { RequestHandler } from 'express';
import * as authService from '../../services/auth.service.js';
import { toPublicUser } from '../../services/users.service.js';
import { currentUserId } from '../middleware/requireAuth.js';
import { deleteAccountSchema, updateAccountSchema } from '../schemas/auth.schemas.js';
import { clearSessionCookie } from './auth.controller.js';

export const updateAccount: RequestHandler = async (req, res) => {
  const { timezone } = updateAccountSchema.parse(req.body);
  const user = await authService.updateTimezone(currentUserId(req), timezone);
  res.status(200).json({ data: toPublicUser(user) });
};

export const deleteAccount: RequestHandler = async (req, res) => {
  const confirmation = deleteAccountSchema.parse(req.body);
  const userId = currentUserId(req);
  await authService.deleteAccount(userId, confirmation);
  req.log.info({ userId }, 'Account deleted');
  clearSessionCookie(res);
  res.status(204).end();
};
