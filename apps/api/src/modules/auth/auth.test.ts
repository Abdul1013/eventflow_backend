import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { signAccessToken } from '../../lib/jwt.js';

const BASE = '/api/v1/auth';

const RUN_ID = Date.now();
const EMAIL = `auth_test_${RUN_ID}@example.com`;
const PASSWORD = 'TestPass1';
const NAME = 'Auth Tester';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const doRegister = (email = EMAIL, password = PASSWORD, name = NAME) =>
  request(app).post(`${BASE}/register`).send({ name, email, password });

const doLogin = (email = EMAIL, password = PASSWORD) =>
  request(app).post(`${BASE}/login`).send({ email, password });

const extractCookie = (res: request.Response): string => {
  const raw = res.headers['set-cookie'] as string[] | string;
  const cookies = Array.isArray(raw) ? raw : [raw];
  const rt = cookies.find((c) => c.startsWith('refreshToken='));
  if (!rt) throw new Error('refreshToken cookie not found in response');
  return rt;
};

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('rejects missing body with 422', async () => {
    const res = await request(app).post(`${BASE}/register`).send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('rejects weak password (no uppercase) with 422', async () => {
    expect((await doRegister(EMAIL, 'weakpass1')).status).toBe(422);
  });

  it('rejects weak password (no number) with 422', async () => {
    expect((await doRegister(EMAIL, 'WeakPassNoNum')).status).toBe(422);
  });

  it('creates user — returns 201 and AuthUser shape without passwordHash', async () => {
    const res = await doRegister();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ email: EMAIL, name: NAME, role: 'ATTENDEE' });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
    const res = await doRegister();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeAll(async () => {
    // Verify the email so subsequent login tests can succeed
    await prisma.user.update({ where: { email: EMAIL }, data: { emailVerified: true } });
  });

  it('rejects unknown email with 401 INVALID_CREDENTIALS', async () => {
    const res = await doLogin('nobody@example.com');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await doLogin(EMAIL, 'WrongPass1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unverified email with 403 EMAIL_NOT_VERIFIED', async () => {
    const unverifiedEmail = `unverified_${RUN_ID}@example.com`;
    await doRegister(unverifiedEmail);
    const res = await doLogin(unverifiedEmail);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    await prisma.user.deleteMany({ where: { email: unverifiedEmail } });
  });

  it('returns accessToken + user and sets HttpOnly refreshToken cookie', async () => {
    const res = await doLogin();
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.expiresIn).toBe(900);
    expect(res.body.data.user.email).toBe(EMAIL);
    const cookie = extractCookie(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('returns 401 MISSING_REFRESH_TOKEN when no cookie present', async () => {
    const res = await request(app).post(`${BASE}/refresh`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_REFRESH_TOKEN');
  });

  it('returns new accessToken and rotates the refresh cookie', async () => {
    const loginRes = await doLogin();
    const cookie = extractCookie(loginRes);

    const refreshRes = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeTruthy();
    expect(extractCookie(refreshRes)).not.toBe(cookie);
  });

  it('rejects a rotated (already-used) refresh token with 401', async () => {
    const loginRes = await doLogin();
    const cookie = extractCookie(loginRes);

    await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('clears the refresh cookie and returns 200', async () => {
    const loginRes = await doLogin();
    const cookie = extractCookie(loginRes);

    const logoutRes = await request(app).post(`${BASE}/logout`).set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);

    const setCookie = logoutRes.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const rtCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(rtCookie).toMatch(/Max-Age=0|Expires=/i);
  });

  it('refresh with the old cookie after logout returns 401', async () => {
    const loginRes = await doLogin();
    const cookie = extractCookie(loginRes);

    await request(app).post(`${BASE}/logout`).set('Cookie', cookie);
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('returns 200 even when called without a cookie (already logged out — idempotent)', async () => {
    const res = await request(app).post(`${BASE}/logout`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /auth/verify-email ───────────────────────────────────────────────────

describe('GET /auth/verify-email', () => {
  it('returns 400 when token query param is missing', async () => {
    const res = await request(app).get(`${BASE}/verify-email`);
    expect(res.status).toBe(400);
  });

  it('returns 400 TOKEN_INVALID_OR_EXPIRED for a bogus token', async () => {
    const res = await request(app)
      .get(`${BASE}/verify-email`)
      .query({ token: 'completely-invalid-token' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('redirects (302) on a valid token and marks the user verified', async () => {
    const verifyEmail = `verify_test_${RUN_ID}@example.com`;
    await doRegister(verifyEmail);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: verifyEmail } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await redis.set(`email_verify:${tokenHash}`, user.id, 'EX', 900);

    const res = await request(app)
      .get(`${BASE}/verify-email`)
      .query({ token: rawToken })
      .redirects(0); // do not follow, inspect the 302 directly

    expect(res.status).toBe(302);
    const updated = await prisma.user.findUniqueOrThrow({ where: { email: verifyEmail } });
    expect(updated.emailVerified).toBe(true);
    await prisma.user.delete({ where: { email: verifyEmail } });
  });

  it('second verify on an already-verified user with a fresh token still returns 302 (idempotent)', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await redis.set(`email_verify:${tokenHash}`, user.id, 'EX', 900);

    const res = await request(app)
      .get(`${BASE}/verify-email`)
      .query({ token: rawToken })
      .redirects(0);

    expect(res.status).toBe(302);
  });
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  it('returns 422 for an invalid email format', async () => {
    const res = await request(app).post(`${BASE}/forgot-password`).send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  it('returns 200 for an unknown email (no enumeration leak)', async () => {
    const res = await request(app).post(`${BASE}/forgot-password`).send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
  });

  it('returns 200 for a registered email', async () => {
    const res = await request(app).post(`${BASE}/forgot-password`).send({ email: EMAIL });
    expect(res.status).toBe(200);
  });
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────

describe('POST /auth/reset-password', () => {
  it('rejects an invalid body (short password) with 422', async () => {
    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ token: 'x', newPassword: 'short' });
    expect(res.status).toBe(422);
  });

  it('rejects a bogus token with 400 INVALID_RESET_TOKEN', async () => {
    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ token: 'deadbeef'.repeat(8), newPassword: 'NewPass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects new password equal to current password with 400 PASSWORD_UNCHANGED', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await redis.set(`pwd_reset:${tokenHash}`, user.id, 'EX', 900);

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ token: rawToken, newPassword: PASSWORD }); // same as original
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_UNCHANGED');
  });

  it('resets the password; old password stops working, new password works', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await redis.set(`pwd_reset:${tokenHash}`, user.id, 'EX', 900);

    const newPassword = 'NewPass1Reset';
    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ token: rawToken, newPassword });
    expect(res.status).toBe(200);

    expect((await doLogin(EMAIL, PASSWORD)).status).toBe(401);
    expect((await doLogin(EMAIL, newPassword)).status).toBe(200);
  });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('returns 401 UNAUTHORIZED without a token', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the current user profile with a valid Bearer token', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const accessToken = signAccessToken({ sub: user.id, role: 'ATTENDEE' });

    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: EMAIL, name: NAME, role: 'ATTENDEE' });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'auth_test_' } },
    select: { id: true },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'auth_test_' } } });
});
