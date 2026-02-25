/**
 * Pure JWT utility functions — no side effects.
 * The frontend only needs to read claims; the server handles signature verification.
 */

interface DecodedJwt {
  sub?: string;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Decodes a JWT without verifying its signature.
 * Returns null if the token is malformed.
 */
export function decodeToken(token: string): DecodedJwt | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64 → JSON
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)) as DecodedJwt;
  } catch {
    return null;
  }
}

/**
 * Returns true if the token is expired or malformed.
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  return decoded.exp * 1000 < Date.now();
}

/**
 * Returns true if the token will expire within `thresholdSeconds`.
 * A malformed or already-expired token also returns true.
 */
export function isTokenExpiringSoon(token: string, thresholdSeconds: number): boolean {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  return decoded.exp * 1000 < Date.now() + thresholdSeconds * 1000;
}
