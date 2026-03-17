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
      forwardedToEmail: false,
      receivedAt: received,
    });

    const user = await User.findById(req.userId).select('targetEmail email').lean();
    if (!user) {
      res.status(201).json({ success: true, data: doc });
      return;
    }

    const destinationEmail = (user.targetEmail || user.email || '').trim();
    if (destinationEmail) {
      try {
        await sendPaymentNotificationEmail(destinationEmail, source, title, message, received);
        await PaymentNotification.findByIdAndUpdate(doc._id, {
          forwardedToEmail: true,
          forwardedEmail: destinationEmail,
          emailSentAt: new Date(),
          $unset: { emailError: 1 },
        });
      } catch (err) {
        console.error('Failed to send notification email:', err);
        await PaymentNotification.findByIdAndUpdate(doc._id, {
          forwardedToEmail: false,
          forwardedEmail: destinationEmail,
          emailError: err instanceof Error ? err.message : 'Unknown email error',
        });
      }
    }

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};

export const getPaymentNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const filter: Record<string, unknown> = { userId: req.userId };
    if (search) {
      filter.$or = [
        { source: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') },
        { message: new RegExp(search, 'i') },
        { currency: new RegExp(search, 'i') },
        { forwardedEmail: new RegExp(search, 'i') },
      ];
    }

    const [data, total] = await Promise.all([
      PaymentNotification.find(filter)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentNotification.countDocuments(filter),
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

export const deleteAllPaymentNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await PaymentNotification.deleteMany({ userId: req.userId });
    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount ?? 0,
      },
    });
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
