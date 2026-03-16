import { Router } from 'express';
import { authenticate, requireActiveSubscription } from '../middleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.use(authenticate);

router.post('/', requireActiveSubscription, notificationController.createPaymentNotification);
router.get('/', notificationController.getNotifications);
router.put('/:id/read', notificationController.markAsRead);

export default router;
