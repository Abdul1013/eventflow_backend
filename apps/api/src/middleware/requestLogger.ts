import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Skip /health — high-frequency polling creates noise in log streams
  if (req.path === '/health') {
    next();
    return;
  }

  req.startTime = Date.now();

  // Intercept res.json so we can read the body after it is sent.
  // Used by the /checkin/scan branch to append the scan result code.
  const _originalJson = res.json.bind(res) as Response['json'];
  res.json = function jsonInterceptor(body?: unknown): Response {
    res.locals.responseBody = body;
    return _originalJson(body);
  } as Response['json'];

  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime ?? Date.now());

    logger.info(
      { method: req.method, path: req.path, status: res.statusCode, durationMs },
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`,
    );

    // /checkin/scan: log the scan result code for real-time load-test visibility
    if (req.path === '/api/v1/checkin/scan' && res.locals.responseBody) {
      const body = res.locals.responseBody as { data?: { result?: string } };
      if (body.data?.result) {
        logger.info({ result: body.data.result }, `[checkin] scan result: ${body.data.result}`);
      }
    }
  });

  next();
};
