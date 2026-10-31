import type { RequestHandler } from 'express';
import * as dashboardService from '../../services/dashboard.service.js';
import { currentAuth } from '../middleware/requireAuth.js';
import { trendsQuerySchema } from '../schemas/reports.schemas.js';

export const getSummary: RequestHandler = async (req, res) => {
  const { userId, timezone } = currentAuth(req);
  res.status(200).json({ data: await dashboardService.getSummary({ userId, timezone }) });
};

export const getCategoryBreakdown: RequestHandler = async (req, res) => {
  const { userId, timezone } = currentAuth(req);
  res.status(200).json({ data: await dashboardService.getCategoryBreakdown({ userId, timezone }) });
};

export const getSpendingTrends: RequestHandler = async (req, res) => {
  const { userId, timezone } = currentAuth(req);
  const { months } = trendsQuerySchema.parse(req.query);
  res
    .status(200)
    .json({ data: await dashboardService.getSpendingTrends({ userId, timezone }, months) });
};
