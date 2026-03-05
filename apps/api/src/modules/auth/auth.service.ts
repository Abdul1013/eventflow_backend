import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/database.js';
import { redisSet, redisGet, redisDel } from '../../config/redis.js';
import { Errors } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js';
import { env } from '../../config/env.js';
import type { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto.js';
import type { AuthUser, AuthTokens } from '@eventflow/types' with { 'resolution-mode': 'import' };

// ─── Constants ────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const RESET_TTL_SECONDS = 15 * 60;             // 15 minutes
const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const toAuthUser = (u: {
  id: string;
  email: string;
  name: string;
  role: string;
}): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role as AuthUser['role'],
});

// ─── Service functions ────────────────────────────────────────────────────────

export const register = async (dto: RegisterDto): Promise<AuthUser> => {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) throw Errors.emailTaken();

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { name: dto.name, email: dto.email, passwordHash, phone: dto.phone ?? null },
    select: { id: true, name: true, email: true, role: true },
  });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  await redisSet(`email_verify:${tokenHash}`, EMAIL_VERIFY_TTL_SECONDS, user.id);
  const verifyLink = `${env.API_URL}/api/v1/auth/verify-email?token=${rawToken}`;
  await sendVerificationEmail(dto.email, dto.name, verifyLink);

  return toAuthUser(user);
};

export const verifyEmail = async (rawToken: string): Promise<void> => {
  const tokenHash = hashToken(rawToken);
  const userId = await redisGet(`email_verify:${tokenHash}`);
  if (!userId) throw Errors.tokenInvalidOrExpired();

  await Promise.all([
    prisma.user.update({ where: { id: userId }, data: { emailVerified: true } }),
    redisDel(`email_verify:${tokenHash}`),
  ]);
};

export interface LoginResult {
  tokens: AuthTokens;
  rawRefreshToken: string;
  user: AuthUser;
}

export const login = async (dto: LoginDto): Promise<LoginResult> => {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user) throw Errors.invalidCredentials();

  const valid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!valid) throw Errors.invalidCredentials();

  // Reject login until the user verifies their email address
  if (!user.emailVerified) throw Errors.emailNotVerified();

  const rawToken = crypto.randomUUID();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  await Promise.all([
    prisma.refreshToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
    redisSet(`rt:${tokenHash}`, REFRESH_TTL_SECONDS, user.id),
  ]);

  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return {
    tokens: { accessToken, expiresIn: 900 },
    rawRefreshToken: rawToken,
    user: toAuthUser(user),
  };
};

export interface RefreshResult extends AuthTokens {
  rawRefreshToken: string;
}

export const refresh = async (rawToken: string): Promise<RefreshResult> => {
  const tokenHash = hashToken(rawToken);

  const cachedUserId = await redisGet(`rt:${tokenHash}`);
  if (!cachedUserId) throw Errors.invalidRefreshToken();

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
    await redisDel(`rt:${tokenHash}`);
    throw Errors.invalidRefreshToken();
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });

  const newRawToken = crypto.randomUUID();
  const newTokenHash = hashToken(newRawToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  await Promise.all([
    prisma.refreshToken.delete({ where: { tokenHash } }),
    redisDel(`rt:${tokenHash}`),
    prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: newTokenHash, expiresAt: newExpiresAt },
    }),
    redisSet(`rt:${newTokenHash}`, REFRESH_TTL_SECONDS, user.id),
  ]);

  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return { accessToken, expiresIn: 900, rawRefreshToken: newRawToken };
};

export const logout = async (rawToken: string): Promise<void> => {
  const tokenHash = hashToken(rawToken);
  await Promise.all([
    prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined),
    redisDel(`rt:${tokenHash}`),
  ]);
};

export const forgotPassword = async (dto: ForgotPasswordDto): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user) return; // no enumeration

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  await redisSet(`pwd_reset:${tokenHash}`, RESET_TTL_SECONDS, user.id);
  await sendPasswordResetEmail(dto.email, user.name, resetLink);
};

export const getMe = async (userId: string): Promise<AuthUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw Errors.notFound('User');
  return toAuthUser(user);
};

export const resetPassword = async (dto: ResetPasswordDto): Promise<void> => {
  const tokenHash = hashToken(dto.token);
  const userId = await redisGet(`pwd_reset:${tokenHash}`);
  if (!userId) throw Errors.invalidResetToken();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });

  // Reject if new password is identical to the current one
  const isSame = await bcrypt.compare(dto.newPassword, user.passwordHash);
  if (isSame) throw Errors.passwordUnchanged();

  const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

  await Promise.all([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
    redisDel(`pwd_reset:${tokenHash}`),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};
