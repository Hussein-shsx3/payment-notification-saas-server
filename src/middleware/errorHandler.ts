import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../utils/errors';
import { config } from '../config';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors)
      .map((e: any) => e.message)
      .join(', ');
    res.status(400).json({ success: false, message: message || 'Validation failed' });
    return;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ success: false, message: 'Image too large (max 5MB)' });
      return;
    }
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  if (err.message && /Only JPEG|image file is required/i.test(err.message)) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  const statusCode = 500;
  const message =
    config.env === 'production' ? 'Internal server error' : (err.message || 'Something went wrong');

  if (config.env !== 'production') {
    console.error(err);
  }

  res.status(statusCode).json({ success: false, message });
};
