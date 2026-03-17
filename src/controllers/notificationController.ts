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
    const filter: Record<string, unknown> = { userId: req.userId };

    const fromStr = String(req.query.from || '').trim();
    const toStr = String(req.query.to || '').trim();
    if (fromStr || toStr) {
      filter.receivedAt = {};
      if (fromStr) {
        const from = new Date(fromStr);
        if (!isNaN(from.getTime())) (filter.receivedAt as Record<string, Date>).$gte = from;
      }
      if (toStr) {
        const to = new Date(toStr);
        if (!isNaN(to.getTime())) (filter.receivedAt as Record<string, Date>).$lte = to;
      }
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

export const deletePaymentNotification = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await PaymentNotification.findOneAndDelete({
      _id: id,
      userId: req.userId,
    });
    if (!deleted) {
      next(new BadRequestError('Payment notification not found'));
      return;
    }
    res.json({ success: true, data: { deleted: true } });
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
