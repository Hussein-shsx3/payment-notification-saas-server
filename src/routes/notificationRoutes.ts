import { Router } from 'express';
import { authenticate } from '../middleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.use(authenticate);

router.post('/', notificationController.createPaymentNotification);
router.get('/', notificationController.getNotifications);
router.get('/payments', notificationController.getPaymentNotifications);
router.delete('/payments', notificationController.deleteAllPaymentNotifications);
router.delete('/payments/:id', notificationController.deletePaymentNotification);
router.put('/:id/read', notificationController.markAsRead);
router.post('/capture', notificationController.capturePaymentNotificationFromAndroid);

export default router;
