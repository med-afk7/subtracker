import { Router } from 'express';
import {
  archiveSubscription,
  cancelSubscription,
  createSubscription,
  deleteSubscription,
  getPriceHistory,
  getSubscription,
  listSubscriptions,
  reactivateSubscription,
  unarchiveSubscription,
  updateSubscription,
} from '../controllers/subscriptions.controller.js';
import { exportCsv } from '../controllers/export.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// All subscription routes require a logged-in user
router.use(requireAuth);

router.get('/', listSubscriptions);
// Before '/:id', so "export" isn't taken for an id
router.get('/export', exportCsv);
router.post('/', createSubscription);
router.get('/:id', getSubscription);
router.get('/:id/history', getPriceHistory);
router.patch('/:id', updateSubscription);
router.delete('/:id', deleteSubscription);
router.post('/:id/cancel', cancelSubscription);
router.post('/:id/reactivate', reactivateSubscription);
router.post('/:id/archive', archiveSubscription);
router.post('/:id/unarchive', unarchiveSubscription);

export default router;
