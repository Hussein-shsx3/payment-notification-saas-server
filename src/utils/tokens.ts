import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';

// Use seconds for compatibility with @types/jsonwebtoken (1d = 86400, 30d = 2592000)
const accessExpiresInSeconds = 86400;
const refreshExpiresInSeconds = 2592000;

export const generateAccessToken = (userId: string): string => {
  return jwt.sign(
    { userId, type: 'access' } as JwtPayload,
    config.jwt.accessSecret,
    { expiresIn: accessExpiresInSeconds }
  );
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId, type: 'refresh' } as JwtPayload,
    config.jwt.refreshSecret,
    { expiresIn: refreshExpiresInSeconds }
  );
};

export const generateAdminToken = (adminId: string): string => {
  return jwt.sign(
    { userId: adminId, type: 'admin' } as JwtPayload,
    config.jwt.accessSecret,
    { expiresIn: accessExpiresInSeconds }
  );
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
};

export const randomToken = (): string => crypto.randomBytes(32).toString('hex');

/** 6-digit numeric code (may start with 0). */
export function randomVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
