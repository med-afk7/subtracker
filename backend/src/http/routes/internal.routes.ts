import { Router } from 'express';
import { tick } from '../controllers/internal.controller.js';

const router = Router();

router.post('/tick', tick);

export default router;
