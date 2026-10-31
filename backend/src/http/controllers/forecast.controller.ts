import type { RequestHandler } from 'express';
import * as forecastService from '../../services/forecast.service.js';
import { currentAuth } from '../middleware/requireAuth.js';
import { forecastQuerySchema } from '../schemas/reports.schemas.js';

export const getForecast: RequestHandler = async (req, res) => {
  const { userId, timezone } = currentAuth(req);
  const { range } = forecastQuerySchema.parse(req.query);
  res.status(200).json({ data: await forecastService.getForecast({ userId, timezone }, range) });
};
