import { Router } from 'express';
import { authenticate } from '../middleware';
import * as supportController from '../controllers/supportController';

const router = Router();

router.get('/config', authenticate, supportController.getSupportConfig);
router.get('/messages', authenticate, supportController.listMySupportMessages);
router.post('/messages', authenticate, supportController.postSupportMessage);

export default router;
