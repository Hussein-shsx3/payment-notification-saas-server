import { Router } from 'express';
import { authenticateAdmin } from '../middleware';
import * as adminController from '../controllers/adminController';
import * as adminSupportController from '../controllers/adminSupportController';

const router = Router();

router.post('/login', adminController.login);
// GET must not fall through to authenticateAdmin (would 401). Browsers prefetch/open as GET.
router.get('/login', (_req, res) => {
  res.status(405).set('Allow', 'POST').json({
    success: false,
    message: 'Use POST /api/admin/login with JSON body: { "email", "password" }',
  });
});

router.use(authenticateAdmin);

router.get('/users', adminController.getUsers);
router.get('/users/export', adminController.exportUsersCsv);
router.put('/users/:userId/payments/:paymentId', adminController.updateSubscriptionPayment);
router.delete('/users/:userId/payments/:paymentId', adminController.deleteSubscriptionPayment);
router.delete('/users/:userId', adminController.deleteUser);
router.post('/users/:userId/clear-subscription', adminController.clearUserSubscription);
router.post('/users/:userId/send-verification-email', adminController.sendUserVerificationEmail);
router.patch('/users/:userId/email-verification', adminController.setUserEmailVerification);
router.patch(
  '/users/:userId/subscription-payment-proof/review',
  adminController.setSubscriptionPaymentProofReviewed
);
router.delete(
  '/users/:userId/subscription-payment-proof',
  adminController.deleteSubscriptionPaymentProof
);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/subscription/:userId', adminController.updateSubscription);
router.get('/notifications', adminController.getAdminNotifications);
router.get('/support/messages', adminSupportController.listAllSupportMessages);
router.get('/support/users/:userId/thread', adminSupportController.listThreadForUser);
router.post('/support/users/:userId/reply', adminSupportController.replyAsAdmin);
router.post('/broadcast', adminController.broadcast);
router.get('/stats', adminController.getStats);
router.post('/subscription-maintenance', adminController.runSubscriptionMaintenance);

export default router;
