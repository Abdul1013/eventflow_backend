import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

const passThrough: RequestHandler = (_req, _res, next) => next();
const isTest = process.env.NODE_ENV === 'test';

/** 100 requests per 15 minutes for general API routes */
export const globalRateLimiter: RequestHandler = isTest
  ? passThrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    });

/** 20 requests per minute for auth endpoints (register, login, etc.) */
export const authRateLimiter: RequestHandler = isTest
  ? passThrough
  : rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth requests' } },
    });
