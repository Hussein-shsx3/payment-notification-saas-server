import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models';
import { AuthRequest } from '../types';
import { BadRequestError, NotFoundError } from '../utils/errors';

const SALT_ROUNDS = 12;

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.userId)
      .select('-passwordHash -refreshToken -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires')
      .lean();
    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, targetEmail } = req.body;
    const allowed: Record<string, string> = {};
    if (fullName !== undefined) allowed.fullName = fullName;
    if (targetEmail !== undefined) allowed.targetEmail = targetEmail;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: allowed },
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      next(new NotFoundError('User not found'));
      return;
    }
    res.json({ success: true, data: user });
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
