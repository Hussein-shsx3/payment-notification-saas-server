import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthRequest } from '../types';
import { JwtPayload } from '../types';
import { UnauthorizedError } from '../utils/errors';

export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next(new UnauthorizedError('Access token required'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
    if (decoded.type !== 'access') {
      next(new UnauthorizedError('Invalid token type'));
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
};
