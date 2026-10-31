import { Router } from 'express';
import { getCalendar } from '../controllers/calendar.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', requireAuth, getCalendar);

export default router;
