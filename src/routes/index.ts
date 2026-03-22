import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import notificationRoutes from './notificationRoutes';
import adminRoutes from './adminRoutes';
import supportRoutes from './supportRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/support', supportRoutes);
router.use('/admin', adminRoutes);

export default router;
