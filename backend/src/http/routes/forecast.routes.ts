import { Router } from 'express';
import { getForecast } from '../controllers/forecast.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', requireAuth, getForecast);

export default router;
