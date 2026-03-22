import { Router } from 'express';
import { authenticate } from '../middleware';
import { subscriptionProofUpload } from '../middleware/uploadSubscriptionProof';
import * as userController from '../controllers/userController';

const router = Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);
router.post(
  '/subscription-payment-proof',
  subscriptionProofUpload.single('image'),
  userController.uploadSubscriptionPaymentProof
);

export default router;
