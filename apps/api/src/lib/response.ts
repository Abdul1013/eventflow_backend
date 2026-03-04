import type { Response } from 'express';

interface SuccessMeta {
  page?: number;
  total?: number;
  limit?: number;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: SuccessMeta,
) => {
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
};

export const sendError = (
  res: Response,
  statusCode: number,
  code: string,
  message: string,
) => {
  res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
};
