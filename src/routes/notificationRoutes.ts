import { Router } from 'express';
import { authenticate, requireActiveSubscription, requireFullAccess } from '../middleware';
import * as notificationController from '../controllers/notificationController';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireActiveSubscription,
  requireFullAccess,
  notificationController.createPaymentNotification
);
router.get('/', requireFullAccess, notificationController.getNotifications);
router.get('/payments/stats', notificationController.getPaymentStats);
router.get('/payments', notificationController.getPaymentNotifications);
router.delete('/payments', requireFullAccess, notificationController.deleteAllPaymentNotifications);
router.delete('/payments/:id', requireFullAccess, notificationController.deletePaymentNotification);
router.patch('/payments/:id/direction', requireFullAccess, notificationController.updatePaymentNotificationDirection);
router.put('/:id/read', requireFullAccess, notificationController.markAsRead);
router.post(
  '/capture',
  requireActiveSubscription,
  requireFullAccess,
  notificationController.capturePaymentNotificationFromAndroid
);

export default router;
