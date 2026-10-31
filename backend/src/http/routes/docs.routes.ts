import { Router } from 'express';
import { docsInitScript, docsPage, openApiJson } from '../controllers/docs.controller.js';

const router = Router();

router.get('/', docsPage);
router.get('/openapi.json', openApiJson);
router.get('/init.js', docsInitScript);

export default router;
