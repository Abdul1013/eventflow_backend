import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from './authenticate.js';
import { AppError } from '../lib/AppError.js';

// ─── Mock jwt module so tests never need a real secret ───────────────────────

vi.mock('../lib/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

import { verifyAccessToken } from '../lib/jwt.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

const res = {} as Response;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UNAUTHORIZED when Authorization header is missing', () => {
    const req = makeReq();
    expect(() => authenticate(req, res, next)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED', statusCode: 401 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when header does not start with "Bearer "', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    expect(() => authenticate(req, res, next)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED', statusCode: 401 }),
    );
  });

  it('attaches req.user and calls next() for a valid token', () => {
    const payload = { sub: 'user-1', role: 'ATTENDEE' as const };
    vi.mocked(verifyAccessToken).mockReturnValue(payload);

    const req = makeReq('Bearer valid.jwt.token');
    authenticate(req, res, next);

    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws TOKEN_EXPIRED when the token is expired', () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired', new Date());
    });

    const req = makeReq('Bearer expired.jwt.token');
    let thrown: unknown;
    try {
      authenticate(req, res, next);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('TOKEN_EXPIRED');
    expect((thrown as AppError).statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws TOKEN_INVALID for a malformed token', () => {
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new jwt.JsonWebTokenError('invalid signature');
    });

    const req = makeReq('Bearer bad.token.here');
    let thrown: unknown;
    try {
      authenticate(req, res, next);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('TOKEN_INVALID');
    expect((thrown as AppError).statusCode).toBe(401);
  });
});
