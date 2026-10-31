import { Router } from 'express';
import { listCategories } from '../controllers/subscriptions.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', requireAuth, listCategories);

export default router;
