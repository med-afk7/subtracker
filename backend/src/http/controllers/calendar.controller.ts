import type { RequestHandler } from 'express';
import * as calendarService from '../../services/calendar.service.js';
import { currentAuth } from '../middleware/requireAuth.js';
import { calendarQuerySchema } from '../schemas/calendar.schemas.js';

export const getCalendar: RequestHandler = async (req, res) => {
  const { userId, timezone } = currentAuth(req);
  const query = calendarQuerySchema.parse(req.query);
  res.status(200).json({ data: await calendarService.getCalendar({ userId, timezone }, query) });
};
