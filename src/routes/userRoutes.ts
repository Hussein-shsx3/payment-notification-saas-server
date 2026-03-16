import { Router } from 'express';
import { authenticate } from '../middleware';
import * as userController from '../controllers/userController';

const router = Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);

export default router;
