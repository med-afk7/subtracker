import { Router } from 'express';
import { deleteAccount, updateAccount } from '../controllers/account.controller.js';
import { limitByIp } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);

router.patch('/', updateAccount);
router.delete('/', limitByIp(), deleteAccount);

export default router;
