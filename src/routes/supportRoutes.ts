import { Router } from 'express';
import { authenticate } from '../middleware';
import * as supportController from '../controllers/supportController';

const router = Router();

router.use(authenticate);

/** Viewer (web dashboard) and full (app) sessions can use support. */
router.get('/config', supportController.getSupportConfig);
router.get('/messages', supportController.listMySupportMessages);
router.post('/messages', supportController.postSupportMessage);

export default router;
