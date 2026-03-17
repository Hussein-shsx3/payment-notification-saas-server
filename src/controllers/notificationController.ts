import { Request, Response, NextFunction } from 'express';
import { User, PaymentNotification, Notification } from '../models';
import { AuthRequest } from '../types';
import { BadRequestError } from '../utils/errors';
import { sendPaymentNotificationEmail } from '../services/email';

export const createPaymentNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { source, title, message, receivedAt, amount, currency } = req.body;
    if (!source || !title || !message) {
      next(new BadRequestError('source, title and message are required'));
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      next(new BadRequestError('Valid payment amount is required'));
      return;
    }

    const received = receivedAt ? new Date(receivedAt) : new Date();
    const doc = await PaymentNotification.create({
      userId: req.userId,
      source,
      title,
      message,
      amount: parsedAmount,
      currency,
      receivedAt: received,
    });

    const user = await User.findById(req.userId).select('subscriptionEnd targetEmail email').lean();
    if (!user) {
      res.status(201).json({ success: true, data: doc });
      return;
    }

    const now = new Date();
    const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
    const isActive = end && end > now;

    const destinationEmail = (user.targetEmail || user.email || '').trim();
    if (isActive && destinationEmail) {
      try {
        await sendPaymentNotificationEmail(destinationEmail, source, title, message, received);
      } catch (err) {
        console.error('Failed to send notification email:', err);
      }
    }

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Notification.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId: req.userId }),
    ]);

    res.json({
      success: true,
      data: {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    next(e);
  }
};

export const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { isRead: true },
      { new: true }
    );
    if (!updated) {
      next(new BadRequestError('Notification not found'));
      return;
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
};
