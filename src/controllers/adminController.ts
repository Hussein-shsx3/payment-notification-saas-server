import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Admin, User, Notification, SubscriptionPayment, PaymentNotification } from '../models';
import { sendPushNotificationToUser } from '../services/fcm';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { generateAdminToken } from '../utils/tokens';

const SALT_ROUNDS = 12;

interface AdminAuthRequest extends Request {
  adminId?: string;
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      next(new BadRequestError('Email and password are required'));
      return;
    }

    const admin = await Admin.findOne({ email }).select('+passwordHash');
    if (!admin) {
      next(new UnauthorizedError('Invalid credentials'));
      return;
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      next(new UnauthorizedError('Invalid credentials'));
      return;
    }

    const accessToken = generateAdminToken(admin._id.toString());
    res.json({ success: true, accessToken });
  } catch (e) {
    next(e);
  }
};

export const getUsers = async (req: AdminAuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { fullName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phoneNumber: new RegExp(search, 'i') },
      ];
    }

    const [data, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash -refreshToken -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { data, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    next(e);
  }
};

export const updateSubscription = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { subscriptionStart, subscriptionEnd, amount, currency } = req.body;

    if (!subscriptionStart || !subscriptionEnd) {
      next(new BadRequestError('subscriptionStart and subscriptionEnd are required'));
      return;
    }

    const periodStart = new Date(subscriptionStart);
    const periodEnd = new Date(subscriptionEnd);

    if (amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
      next(new BadRequestError('amount must be a positive number when provided'));
      return;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          subscriptionStart: periodStart,
          subscriptionEnd: periodEnd,
          ...(amount !== undefined && {
            currentSubscriptionPrice: amount,
            currentSubscriptionCurrency: currency || 'USD',
          }),
        },
      },
      { new: true }
    ).select('-passwordHash -refreshToken -verificationToken -resetPasswordToken');

    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }

    // Record payment history if amount specified
    if (amount !== undefined) {
      await SubscriptionPayment.create({
        userId: user._id,
        amount,
        currency: currency || 'USD',
        periodStart,
        periodEnd,
      });
    }

    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

export const deleteUser = async (
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

    const existing = await User.findById(userId).select('_id').lean();
    if (!existing) {
      next(new NotFoundError('User not found'));
      return;
    }

    await Promise.all([
      PaymentNotification.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      SubscriptionPayment.deleteMany({ userId }),
    ]);
    await User.findByIdAndDelete(userId);

    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
};

/** Removes subscription dates and pricing from a user (does not delete the account). */
export const clearUserSubscription = async (
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

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $unset: {
          subscriptionStart: '',
          subscriptionEnd: '',
          currentSubscriptionPrice: '',
          currentSubscriptionCurrency: '',
        },
      },
      { new: true }
    ).select('-passwordHash -refreshToken -verificationToken -resetPasswordToken');

    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }

    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

export const getUserDetails = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select(
        '-passwordHash -refreshToken -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires'
      )
      .lean();

    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }

    const payments = await SubscriptionPayment.find({ userId })
      .sort({ periodStart: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        user,
        payments,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const updateSubscriptionPayment = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, paymentId } = req.params;
    const { amount, currency, periodStart, periodEnd } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(paymentId)) {
      next(new BadRequestError('Invalid user or payment id'));
      return;
    }

    const uid = new mongoose.Types.ObjectId(userId);
    const existing = await SubscriptionPayment.findOne({ _id: paymentId, userId: uid });
    if (!existing) {
      next(new NotFoundError('Subscription payment not found'));
      return;
    }

    const updates: Partial<{ amount: number; currency: string; periodStart: Date; periodEnd: Date }> = {};

    if (amount !== undefined) {
      const n = typeof amount === 'number' ? amount : Number(amount);
      if (!Number.isFinite(n) || n < 0) {
        next(new BadRequestError('amount must be a non-negative number'));
        return;
      }
      updates.amount = n;
    }
    if (currency !== undefined) {
      const c = String(currency).trim();
      if (!c) {
        next(new BadRequestError('currency cannot be empty'));
        return;
      }
      updates.currency = c;
    }
    if (periodStart !== undefined) {
      const d = new Date(periodStart);
      if (Number.isNaN(d.getTime())) {
        next(new BadRequestError('Invalid periodStart'));
        return;
      }
      updates.periodStart = d;
    }
    if (periodEnd !== undefined) {
      const d = new Date(periodEnd);
      if (Number.isNaN(d.getTime())) {
        next(new BadRequestError('Invalid periodEnd'));
        return;
      }
      updates.periodEnd = d;
    }

    if (Object.keys(updates).length === 0) {
      next(
        new BadRequestError('No fields to update: provide amount, currency, periodStart, and/or periodEnd')
      );
      return;
    }

    const nextStart = updates.periodStart ?? existing.periodStart;
    const nextEnd = updates.periodEnd ?? existing.periodEnd;
    if (nextStart >= nextEnd) {
      next(new BadRequestError('periodStart must be before periodEnd'));
      return;
    }

    const updated = await SubscriptionPayment.findByIdAndUpdate(
      paymentId,
      { $set: updates },
      { new: true }
    ).lean();

    if (!updated) {
      next(new NotFoundError('Subscription payment not found'));
      return;
    }

    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
};

export const deleteSubscriptionPayment = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, paymentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(paymentId)) {
      next(new BadRequestError('Invalid user or payment id'));
      return;
    }

    const existing = await SubscriptionPayment.findOneAndDelete({
      _id: paymentId,
      userId: new mongoose.Types.ObjectId(userId),
    });
    if (!existing) {
      next(new NotFoundError('Subscription payment not found'));
      return;
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
};

export const exportUsersCsv = async (
  _req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const users = await User.find({})
      .select(
        'fullName email phoneNumber emailVerified subscriptionStart subscriptionEnd currentSubscriptionPrice currentSubscriptionCurrency createdAt'
      )
      .sort({ createdAt: -1 })
      .lean();

    const header = [
      'fullName',
      'email',
      'phoneNumber',
      'emailVerified',
      'subscriptionStart',
      'subscriptionEnd',
      'currentSubscriptionPrice',
      'currentSubscriptionCurrency',
      'createdAt',
    ];

    const rows = users.map((u) =>
      [
        u.fullName,
        u.email,
        u.phoneNumber,
        u.emailVerified ? 'true' : 'false',
        u.subscriptionStart ? new Date(u.subscriptionStart).toISOString() : '',
        u.subscriptionEnd ? new Date(u.subscriptionEnd).toISOString() : '',
        u.currentSubscriptionPrice ?? '',
        u.currentSubscriptionCurrency ?? '',
        u.createdAt ? new Date(u.createdAt).toISOString() : '',
      ]
        .map((value) => {
          const str = String(value ?? '');
          // Escape double quotes and wrap field that contains comma or quote
          if (str.includes(',') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    );

    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=\"users-export.csv\"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
};

export const getAdminNotifications = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Notification.find({ type: 'admin' })
        .populate('userId', 'fullName email phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ type: 'admin' }),
    ]);

    res.json({
      success: true,
      data: { data, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    next(e);
  }
};

export const broadcast = async (req: AdminAuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { title, message, userIds } = req.body;
    if (!title || !message) {
      next(new BadRequestError('title and message are required'));
      return;
    }

    const targetUserIds: mongoose.Types.ObjectId[] =
      Array.isArray(userIds) && userIds.length > 0
        ? userIds.map((id: string) => new mongoose.Types.ObjectId(id))
        : (await User.find({ emailVerified: true }).select('_id').lean()).map((u) => u._id);

    const docs = targetUserIds.map((userId) => ({
      userId,
      title,
      message,
      type: 'admin' as const,
    }));

    await Notification.insertMany(docs);
    res.status(201).json({
      success: true,
      message: `Notification sent to ${docs.length} user(s)`,
    });
  } catch (e) {
    next(e);
  }
};

export const getStats = async (
  _req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const now = new Date();
    const soon3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const soon7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      activeSubscriptions,
      expiringSoon,
      expiringNext7DaysCount,
      usersNeverSubscribed,
      signupsLast30Days,
      monthlyRegistrations,
      dailySignupsLast30Days,
      recentSignups,
      expiringNext7DaysUsers,
      subscriptionPaymentsLast30Sum,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ subscriptionEnd: { $gt: now } }),
      User.countDocuments({
        subscriptionEnd: { $gt: now, $lte: soon3 },
      }),
      User.countDocuments({
        subscriptionEnd: { $gt: now, $lte: soon7 },
      }),
      User.countDocuments({
        $or: [{ subscriptionEnd: { $exists: false } }, { subscriptionEnd: null }],
      }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
            },
          },
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.find({})
        .select('fullName email createdAt')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      User.find({
        subscriptionEnd: { $gt: now, $lte: soon7 },
      })
        .select('fullName email subscriptionEnd')
        .sort({ subscriptionEnd: 1 })
        .limit(8)
        .lean(),
      SubscriptionPayment.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const monthlyData = monthlyRegistrations.map((item) => {
      const year = item._id.year as number;
      const month = item._id.month as number;
      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleString('default', { month: 'short' });
      return { label, year, month, count: item.count as number };
    });

    const dailySignupPoints = dailySignupsLast30Days.map((d) => ({
      date: d._id as string,
      count: d.count as number,
    }));

    const revenue30 =
      subscriptionPaymentsLast30Sum[0] && typeof (subscriptionPaymentsLast30Sum[0] as { total?: number }).total ===
      'number'
        ? (subscriptionPaymentsLast30Sum[0] as { total: number }).total
        : 0;

    const inactiveSubscriptions = Math.max(0, totalUsers - activeSubscriptions);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeSubscriptions,
        inactiveSubscriptions,
        expiringSoon,
        expiringNext7DaysCount,
        usersNeverSubscribed,
        signupsLast30Days,
        monthlyRegistrations: monthlyData,
        dailySignupsLast30Days: dailySignupPoints,
        recentSignups,
        expiringNext7DaysUsers,
        subscriptionRevenueLast30Days: revenue30,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const runSubscriptionMaintenance = async (
  _req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Users whose subscription will expire within 3 days and who have not been warned yet.
    const usersNeedingWarning = await User.find({
      subscriptionEnd: { $gt: now, $lte: soon },
      $or: [
        { lastSubscriptionWarningSentAt: { $exists: false } },
        { lastSubscriptionWarningSentAt: null },
      ],
    }).select('_id fullName email subscriptionEnd');

    let warningsCreated = 0;

    for (const user of usersNeedingWarning) {
      const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
      const endDateStr = end ? end.toLocaleDateString() : 'soon';

      const title = 'Subscription expiring soon';
      const message =
        `Your subscription will expire on ${endDateStr}. ` +
        'Please renew your subscription to continue using the service.';

      await Notification.create({
        userId: user._id,
        title,
        message,
        type: 'system',
        isRead: false,
      });

      user.lastSubscriptionWarningSentAt = now;
      await user.save({ validateBeforeSave: false });

      // Placeholder push – logs for now.
      await sendPushNotificationToUser(user._id.toString(), {
        title,
        body: message,
      });

      warningsCreated += 1;
    }

    // No extra work is required for expired subscriptions: the existing logic
    // already prevents forwarding when subscriptionEnd is in the past.

    res.json({
      success: true,
      data: {
        warningsCreated,
      },
    });
  } catch (e) {
    next(e);
  }
};
