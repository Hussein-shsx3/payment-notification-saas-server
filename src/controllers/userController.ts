import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models';
import { AuthRequest } from '../types';
import { BadRequestError, NotFoundError } from '../utils/errors';

const SALT_ROUNDS = 12;

const toProfileResponse = (user: Record<string, unknown>) => {
  const subscriptionEndRaw = user.subscriptionEnd;
  const endDate =
    typeof subscriptionEndRaw === 'string' || subscriptionEndRaw instanceof Date
      ? new Date(subscriptionEndRaw)
      : null;
  const now = new Date();
  const hasValidEnd = !!endDate && !Number.isNaN(endDate.getTime());
  const isActive = hasValidEnd && endDate > now;

  return {
    ...user,
    subscriptionStatus: isActive ? 'active' : 'inactive',
    isSubscriptionActive: isActive,
  };
};

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.userId)
      .select('-passwordHash -refreshToken -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires')
      .lean();
    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }
    res.json({ success: true, data: toProfileResponse(user as unknown as Record<string, unknown>) });
  } catch (e) {
    next(e);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, targetEmail, phoneNumber } = req.body;
    const allowed: Record<string, string> = {};
    if (fullName !== undefined) allowed.fullName = String(fullName).trim();
    if (targetEmail !== undefined) allowed.targetEmail = String(targetEmail).trim();
    if (phoneNumber !== undefined) {
      const p = String(phoneNumber).trim();
      if (!p) {
        next(new BadRequestError('phoneNumber cannot be empty'));
        return;
      }
      const taken = await User.findOne({ phoneNumber: p, _id: { $ne: req.userId } }).select('_id').lean();
      if (taken) {
        next(new BadRequestError('Phone number already in use'));
        return;
      }
      allowed.phoneNumber = p;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: allowed },
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }
    res.json({
      success: true,
      data: toProfileResponse(user.toObject() as unknown as Record<string, unknown>),
    });
  } catch (e) {
    next(e);
  }
};

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      next(new BadRequestError('currentPassword and newPassword are required'));
      return;
    }

    const user = await User.findById(req.userId).select('+passwordHash');
    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      next(new BadRequestError('Current password is incorrect'));
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    next(e);
  }
};
