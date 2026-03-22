import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Notification, SupportMessage, User } from '../models';
import { BadRequestError, NotFoundError } from '../utils/errors';

interface AdminAuthRequest extends Request {
  adminId?: string;
}

export const listAllSupportMessages = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 30));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      SupportMessage.find({})
        .populate('userId', 'fullName email phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportMessage.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: { data, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    next(e);
  }
};

export const listThreadForUser = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      next(new BadRequestError('Invalid user id'));
      return;
    }

    const messages = await SupportMessage.find({ userId })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    const user = await User.findById(userId).select('fullName email phoneNumber').lean();

    res.json({
      success: true,
      data: { user, messages },
    });
  } catch (e) {
    next(e);
  }
};

export const replyAsAdmin = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;
    const body = String(req.body?.body ?? '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      next(new BadRequestError('Invalid user id'));
      return;
    }
    if (!body) {
      next(new BadRequestError('body is required'));
      return;
    }

    const exists = await User.findById(userId).select('_id').lean();
    if (!exists) {
      next(new NotFoundError('User not found'));
      return;
    }

    const doc = await SupportMessage.create({
      userId,
      from: 'admin',
      body,
    });

    const preview = body.length > 280 ? `${body.slice(0, 277)}…` : body;
    await Notification.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: 'Support team replied',
      message: preview,
      type: 'admin',
    });

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
};
