import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as forecastService from '../../services/forecast.service.js';
import { currentAuth } from '../middleware/requireAuth.js';

const forecastQuerySchema = z.object({ range: z.enum(['30d', '90d', '12m']).default('90d') });

export const getForecast: RequestHandler = async (req, res) => {
  const { userId, timezone } = currentAuth(req);
  const { range } = forecastQuerySchema.parse(req.query);
  res.status(200).json({ data: await forecastService.getForecast({ userId, timezone }, range) });
};
