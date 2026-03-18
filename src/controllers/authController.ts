import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, randomToken } from '../utils/tokens';
import { config } from '../config';

const SALT_ROUNDS = 12;

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, email, phoneNumber, password } = req.body;

    if (!fullName || !email || !phoneNumber || !password) {
      next(new BadRequestError('fullName, email, phoneNumber and password are required'));
      return;
    }

    const existing = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existing) {
      next(new BadRequestError(existing.email === email ? 'Email already registered' : 'Phone number already registered'));
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      passwordHash,
      targetEmail: email,
      emailVerified: true,
    });
  } catch (e) {
    next(e);
    return;
  }

  res.status(201).json({
    success: true,
    message: 'Registration successful.',
  });
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      next(new BadRequestError('Email and password are required'));
      return;
    }

    const user = await User.findOne({ email }).select('+passwordHash +emailVerified +refreshToken');

    if (!user) {
      next(new UnauthorizedError('Invalid credentials'));
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      next(new UnauthorizedError('Invalid credentials'));
      return;
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessExpiresIn,
    });
  } catch (e) {
    next(e);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      next(new BadRequestError('Refresh token required'));
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      next(new UnauthorizedError('Invalid refresh token'));
      return;
    }

    const accessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString());
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: config.jwt.accessExpiresIn,
    });
  } catch (e) {
    next(e);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      next(new BadRequestError('Email is required'));
      return;
    }
    res.json({
      success: true,
      message: 'Password reset via email is currently disabled.',
    });
  } catch (e) {
    next(e);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      next(new BadRequestError('Token and new password are required'));
      return;
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      next(new BadRequestError('Invalid or expired reset token'));
      return;
    }

    user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (e) {
    next(e);
  }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      next(new BadRequestError('Verification token required'));
      return;
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    }).select('+verificationToken +verificationTokenExpires');

    if (!user) {
      next(new BadRequestError('Invalid or expired verification token'));
      return;
    }

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (e) {
    next(e);
  }
};
