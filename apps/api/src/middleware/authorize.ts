import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { Errors } from '../lib/errors.js';

/**
 * RBAC guard — restricts a route to one or more roles.
 * Must be applied after authenticate().
 */
export const authorize = (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw Errors.unauthorized();
    }
    if (!roles.includes(req.user.role)) {
      throw Errors.forbidden();
    }
    next();
  };
