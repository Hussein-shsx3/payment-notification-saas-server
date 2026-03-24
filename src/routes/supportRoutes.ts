import { Router } from 'express';
import { authenticate, requireFullAccess } from '../middleware';
import * as supportController from '../controllers/supportController';

const router = Router();

router.use(authenticate);
router.use(requireFullAccess);

router.get('/config', supportController.getSupportConfig);
router.get('/messages', supportController.listMySupportMessages);
router.post('/messages', supportController.postSupportMessage);

export default router;
