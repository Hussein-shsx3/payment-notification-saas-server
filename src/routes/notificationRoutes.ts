import { Router } from 'express';
import { authenticate } from '../middleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.use(authenticate);

router.post('/', notificationController.createPaymentNotification);
router.get('/', notificationController.getNotifications);
router.get('/payments', notificationController.getPaymentNotifications);
router.delete('/payments', notificationController.deleteAllPaymentNotifications);
router.put('/:id/read', notificationController.markAsRead);

export default router;
