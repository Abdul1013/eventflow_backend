import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps an async route handler and forwards any thrown errors to Express's
 * central error middleware, keeping controllers free of try/catch.
 */
export const asyncHandler = (fn: AsyncFn): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
