import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';
import { UnauthorizedError } from '../utils/errors';

export interface AdminAuthRequest {
  adminId?: string;
  headers: { authorization?: string };
}

export const authenticateAdmin = (
  req: AdminAuthRequest & { adminId?: string },
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next(new UnauthorizedError('Admin token required'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload & { type?: string };
    if (decoded.type !== 'admin') {
      next(new UnauthorizedError('Invalid token type'));
      return;
    }
    req.adminId = decoded.userId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired admin token'));
  }
};
