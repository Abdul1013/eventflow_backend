import type { RequestHandler } from 'express';
import { authenticate } from './authenticate.js';
import { authorize } from './authorize.js';

/**
 * Pre-composed middleware arrays for cleaner route files.
 * Always spread into route declarations: router.get('/path', ...adminRoute, handler)
 */

/** Any authenticated user — verifies the Bearer token. */
export const protectedRoute: RequestHandler[] = [authenticate];

/** ADMIN role only — must be authenticated first. */
export const adminRoute: RequestHandler[] = [authenticate, authorize('ADMIN')];

/** ADMIN or STAFF roles — for staff-facing operations. */
export const staffRoute: RequestHandler[] = [
  authenticate,
  authorize('ADMIN', 'STAFF'),
];
