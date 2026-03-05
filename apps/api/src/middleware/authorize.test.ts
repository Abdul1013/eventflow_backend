import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authorize } from './authorize.js';
import { AppError } from '../lib/AppError.js';
import type { AccessTokenPayload } from '../lib/jwt.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(user?: AccessTokenPayload): Request {
  return { user } as unknown as Request;
}

const res = {} as Response;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authorize middleware', () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when the user role matches', () => {
    const req = makeReq({ sub: 'u1', role: 'ADMIN' });
    authorize('ADMIN')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() when the user matches one of multiple accepted roles', () => {
    const req = makeReq({ sub: 'u1', role: 'STAFF' });
    authorize('ADMIN', 'STAFF')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws FORBIDDEN when the user role does not match', () => {
    const req = makeReq({ sub: 'u1', role: 'ATTENDEE' });
    let thrown: unknown;
    try {
      authorize('ADMIN')(req, res, next);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('FORBIDDEN');
    expect((thrown as AppError).statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when req.user is missing (authenticate not applied)', () => {
    const req = makeReq(undefined);
    let thrown: unknown;
    try {
      authorize('ADMIN')(req, res, next);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('UNAUTHORIZED');
    expect((thrown as AppError).statusCode).toBe(401);
  });
});
