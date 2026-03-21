import { Router } from 'express';
import { authenticate, requireActiveSubscription } from '../middleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.use(authenticate);

router.post('/', requireActiveSubscription, notificationController.createPaymentNotification);
router.get('/', notificationController.getNotifications);
router.get('/payments', notificationController.getPaymentNotifications);
router.delete('/payments', notificationController.deleteAllPaymentNotifications);
router.delete('/payments/:id', notificationController.deletePaymentNotification);
router.patch('/payments/:id/direction', notificationController.updatePaymentNotificationDirection);
router.put('/:id/read', notificationController.markAsRead);
router.post('/capture', requireActiveSubscription, notificationController.capturePaymentNotificationFromAndroid);

export default router;
