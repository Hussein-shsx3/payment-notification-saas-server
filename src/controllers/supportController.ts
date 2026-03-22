import { Response, NextFunction } from 'express';
import { SupportMessage } from '../models';
import { AuthRequest } from '../types';
import { BadRequestError } from '../utils/errors';

export const getSupportConfig = (_req: AuthRequest, res: Response): void => {
  const whatsApp = (process.env.SUPPORT_WHATSAPP_NUMBER ?? '').trim();
  res.json({
    success: true,
    data: {
      whatsApp: whatsApp || null,
      whatsAppHint:
        whatsApp.length > 0
          ? 'If you need a faster response, contact us on WhatsApp.'
          : null,
    },
  });
};

export const listMySupportMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      SupportMessage.find({ userId: req.userId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportMessage.countDocuments({ userId: req.userId }),
    ]);

    res.json({
      success: true,
      data: { data, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    next(e);
  }
};

export const postSupportMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = String(req.body?.body ?? '').trim();
    if (!body) {
      next(new BadRequestError('body is required'));
      return;
    }
    if (body.length > 8000) {
      next(new BadRequestError('Message too long'));
      return;
    }

    const doc = await SupportMessage.create({
      userId: req.userId,
      from: 'user',
      body,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};
