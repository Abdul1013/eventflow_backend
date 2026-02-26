// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sign } from 'jsonwebtoken';
import { decodeToken, isTokenExpired, isTokenExpiringSoon } from './tokenUtils';

const TEST_SECRET = 'test-secret-32-characters-minimum';

// A fixed point in time with 500 ms sub-second precision.
// This ensures JWT's integer-second `exp` is reliably within the comparison
// window when the threshold exactly matches the remaining lifetime:
//   exp = floor(now / 1000) + N   →  exp * 1000 = floor(now/1000)*1000 + N*1000
//   now + N * 1000                →  fractional_ms + N*1000 more than above
// So exp*1000 < now + N*1000 → true even at the boundary.
const BASE_TIME = new Date('2025-01-01T00:00:00.500Z');

// ─── decodeToken ──────────────────────────────────────────────────────────────

describe('decodeToken', () => {
  it('returns an object with the correct claims for a valid token', () => {
    const token = sign(
      { sub: 'user-1', email: 'alice@example.com', role: 'ATTENDEE' },
      TEST_SECRET,
      { expiresIn: '1h' },
    );
    const decoded = decodeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe('user-1');
    expect(decoded?.['email']).toBe('alice@example.com');
    expect(decoded?.role).toBe('ATTENDEE');
    expect(typeof decoded?.exp).toBe('number');
  });

  it('returns the payload for an expired token without verifying the signature', () => {
    const token = sign({ sub: 'user-2' }, TEST_SECRET, { expiresIn: -1 });
    const decoded = decodeToken(token);
    // decodeToken must NOT perform expiry checks — it only reads claims
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe('user-2');
  });

  it('returns null for a malformed string without throwing', () => {
    expect(() => decodeToken('not.a.token')).not.toThrow();
    expect(decodeToken('not.a.token')).toBeNull();
  });

  it('returns null for an empty string without throwing', () => {
    expect(() => decodeToken('')).not.toThrow();
    expect(decodeToken('')).toBeNull();
  });
});

// ─── isTokenExpired ───────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false for a token that expires in 1 hour', () => {
    vi.setSystemTime(BASE_TIME);
    const token = sign({ sub: 'user-1' }, TEST_SECRET, { expiresIn: '1h' });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for an already-expired token', () => {
    vi.setSystemTime(BASE_TIME);
    // expiresIn: -1 sets exp = now - 1 second
    const token = sign({ sub: 'user-1' }, TEST_SECRET, { expiresIn: -1 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true for a malformed string (fail-safe)', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
  });
});

// ─── isTokenExpiringSoon ──────────────────────────────────────────────────────

describe('isTokenExpiringSoon', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false when the token expires in 10 minutes and threshold is 120 s', () => {
    vi.setSystemTime(BASE_TIME);
    const token = sign({ sub: 'user-1' }, TEST_SECRET, { expiresIn: 600 });
    expect(isTokenExpiringSoon(token, 120)).toBe(false);
  });

  it('returns true when the token expires in 1 minute and threshold is 120 s', () => {
    vi.setSystemTime(BASE_TIME);
    const token = sign({ sub: 'user-1' }, TEST_SECRET, { expiresIn: 60 });
    expect(isTokenExpiringSoon(token, 120)).toBe(true);
  });

  it('returns true at the boundary: exp exactly equals threshold (treats equal as expiring)', () => {
    // With BASE_TIME having 500 ms sub-second precision:
    //   exp     = floor(BASE_TIME.ms / 1000) + 120  → lacks the 500 ms fraction
    //   now + threshold = BASE_TIME.ms + 120_000    → includes the 500 ms fraction
    // Therefore exp*1000 < now+threshold → true, matching the "treat equal as expiring" rule.
    vi.setSystemTime(BASE_TIME);
    const token = sign({ sub: 'user-1' }, TEST_SECRET, { expiresIn: 120 });
    expect(isTokenExpiringSoon(token, 120)).toBe(true);
  });

  it('returns true for an already-expired token regardless of threshold', () => {
    vi.setSystemTime(BASE_TIME);
    const token = sign({ sub: 'user-1' }, TEST_SECRET, { expiresIn: -1 });
    expect(isTokenExpiringSoon(token, 120)).toBe(true);
  });

  it('returns true for a malformed string (fail-safe)', () => {
    expect(isTokenExpiringSoon('not-a-jwt', 120)).toBe(true);
  });
});
