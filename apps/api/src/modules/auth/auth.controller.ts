import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import { AppError } from '../../lib/AppError.js';
import { env } from '../../config/env.js';
import * as authService from './auth.service.js';

// ─── Cookie settings ──────────────────────────────────────────────────────────

const COOKIE_NAME = 'refreshToken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/v1/auth',
} as const;

const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
};

// ─── Controllers (explicit RequestHandler type prevents TS2742) ───────────────

export const register: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await authService.register(req.body);
    sendSuccess(res, user, 201);
  },
);

export const login: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await authService.login(req.body);
    res.cookie(COOKIE_NAME, result.rawRefreshToken, COOKIE_OPTIONS);
    sendSuccess(res, { tokens: result.tokens, user: result.user });
  },
);

export const refresh: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const rawToken = req.cookies[COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new AppError('MISSING_REFRESH_TOKEN', 401, 'Refresh token not provided');
    }
    const result = await authService.refresh(rawToken);
    res.cookie(COOKIE_NAME, result.rawRefreshToken, COOKIE_OPTIONS);
    sendSuccess(res, { accessToken: result.accessToken, expiresIn: result.expiresIn });
  },
);

export const logout: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const rawToken = req.cookies[COOKIE_NAME] as string | undefined;
    if (rawToken) {
      await authService.logout(rawToken);
    }
    clearRefreshCookie(res);
    sendSuccess(res, { message: 'Logged out' });
  },
);

export const forgotPassword: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await authService.forgotPassword(req.body);
    sendSuccess(res, { message: 'If that email is registered, a reset link has been sent' });
  },
);

export const resetPassword: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await authService.resetPassword(req.body);
    sendSuccess(res, { message: 'Password updated successfully' });
  },
);

export const getMe: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await authService.getMe(req.user!.sub);
    sendSuccess(res, user);
  },
);

export const verifyEmail: RequestHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const token = req.query['token'] as string | undefined;
    if (!token) {
      throw new AppError('MISSING_TOKEN', 400, 'Verification token is required');
    }
    await authService.verifyEmail(token);
    res.redirect(`${env.FRONTEND_URL}/login?verified=true`);
  },
);
