import { Router } from 'express';
import { authenticateAdmin } from '../middleware';
import * as adminController from '../controllers/adminController';

const router = Router();

router.post('/login', adminController.login);

router.use(authenticateAdmin);

router.get('/users', adminController.getUsers);
router.get('/users/export', adminController.exportUsersCsv);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/subscription/:userId', adminController.updateSubscription);
router.get('/notifications', adminController.getAdminNotifications);
router.post('/broadcast', adminController.broadcast);
router.get('/stats', adminController.getStats);
router.post('/subscription-maintenance', adminController.runSubscriptionMaintenance);

export default router;
