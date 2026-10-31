import { Router } from 'express';
import {
  getCategoryBreakdown,
  getSpendingTrends,
  getSummary,
} from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);

router.get('/summary', getSummary);
router.get('/category-breakdown', getCategoryBreakdown);
router.get('/spending-trends', getSpendingTrends);

export default router;
