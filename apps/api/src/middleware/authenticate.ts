import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Errors } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

/**
 * Verifies the Bearer token and attaches the decoded payload to req.user.
 * Must be applied before any authorize() middleware.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw Errors.unauthorized();
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw Errors.tokenExpired();
    }
    throw Errors.tokenInvalid();
  }
};
