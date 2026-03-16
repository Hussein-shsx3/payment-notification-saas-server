import { Response, NextFunction } from 'express';
import { User } from '../models';
import { AuthRequest } from '../types';
import { ForbiddenError } from '../utils/errors';

export const requireActiveSubscription = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) {
    next(new ForbiddenError('Authentication required'));
    return;
  }

  const user = await User.findById(req.userId).select('subscriptionEnd').lean();
  if (!user) {
    next(new ForbiddenError('User not found'));
    return;
  }

  const now = new Date();
  const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;

  if (!end || end <= now) {
    next(new ForbiddenError('Active subscription required'));
    return;
  }

  next();
};
