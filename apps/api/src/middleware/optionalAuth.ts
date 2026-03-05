import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';

/**
 * Silently verifies the Bearer token if present.
 * Sets req.user if the token is valid; otherwise calls next() with req.user undefined.
 * Use on routes that serve different content to authenticated vs unauthenticated users.
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Token invalid or expired — proceed as unauthenticated
    }
  }
  next();
};
