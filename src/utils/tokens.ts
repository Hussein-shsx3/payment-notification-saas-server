import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { AccessMode, JwtPayload } from '../types';

const accessExpires = config.jwt.accessExpiresIn as SignOptions['expiresIn'];
const refreshExpires = config.jwt.refreshExpiresIn as SignOptions['expiresIn'];

/** Uses JWT_ACCESS_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN from env (defaults in config). */
export const generateAccessToken = (userId: string, accessMode: AccessMode = 'full'): string => {
  return jwt.sign(
    { userId, type: 'access', accessMode } as JwtPayload,
    config.jwt.accessSecret,
    { expiresIn: accessExpires }
  );
};

export const generateRefreshToken = (userId: string, accessMode: AccessMode = 'full'): string => {
  return jwt.sign(
    { userId, type: 'refresh', accessMode } as JwtPayload,
    config.jwt.refreshSecret,
    { expiresIn: refreshExpires }
  );
};

export const generateAdminToken = (adminId: string): string => {
  return jwt.sign(
    { userId: adminId, type: 'admin' } as JwtPayload,
    config.jwt.accessSecret,
    { expiresIn: accessExpires }
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
