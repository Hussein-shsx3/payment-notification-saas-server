import { Router } from 'express';
import { authenticate, requireFullAccess } from '../middleware';
import { subscriptionProofUpload } from '../middleware/uploadSubscriptionProof';
import * as userController from '../controllers/userController';

const router = Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', requireFullAccess, userController.updateProfile);
router.put('/change-password', requireFullAccess, userController.changePassword);
router.put('/viewer-password', requireFullAccess, userController.setViewerPassword);
router.post(
  '/subscription-payment-proof',
  requireFullAccess,
  subscriptionProofUpload.single('image'),
  userController.uploadSubscriptionPaymentProof
);

export default router;
