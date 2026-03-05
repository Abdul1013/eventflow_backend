import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

type Target = 'body' | 'params' | 'query';

/**
 * Zod validation middleware factory.
 * Parses the specified request part and replaces it with the validated output.
 * Throws ZodError on failure — caught by errorHandler.
 */
export const validate =
  (schema: ZodSchema, target: Target = 'body'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    req[target] = schema.parse(req[target]);
    next();
  };
