import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { ForbiddenError } from '../utils/errors';

/** Blocks read-only "viewer" sessions from mutating account or notification data. */
export const requireFullAccess = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (req.accessMode === 'viewer') {
    next(new ForbiddenError('This action requires the main account'));
    return;
  }
  next();
};
