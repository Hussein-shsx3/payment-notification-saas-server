import { Request } from 'express';
import { Types } from 'mongoose';

export type NotificationType = 'system' | 'admin';

export interface JwtPayload {
  userId: string;
  type: 'access' | 'refresh' | 'admin';
}

export interface AuthRequest extends Request {
  userId?: string;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Re-export for models
export type ObjectId = Types.ObjectId;
