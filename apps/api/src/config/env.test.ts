import { describe, it, expect } from 'vitest';
import { envSchema } from './env.js';

/** Minimal valid env object — all optional fields omitted. */
const BASE: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  HMAC_SECRET: 'c'.repeat(32),
  CLOUDINARY_URL: 'https://cloudinary.example.com',
  SAO_ENGINE_URL: 'http://localhost:8000',
  SAO_ENGINE_SECRET: 's'.repeat(16),
  FRONTEND_URL: 'http://localhost:5174',
  ADMIN_URL: 'http://localhost:5173',
};

describe('envSchema', () => {
  it('accepts a fully valid env', () => {
    const result = envSchema.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  it('accepts env without RESEND_API_KEY (optional)', () => {
    const result = envSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.RESEND_API_KEY).toBeUndefined();
  });

  it('rejects RESEND_API_KEY shorter than 10 characters', () => {
    const result = envSchema.safeParse({ ...BASE, RESEND_API_KEY: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.RESEND_API_KEY).toBeDefined();
    }
  });

  it('rejects JWT_ACCESS_SECRET shorter than 32 characters', () => {
    const result = envSchema.safeParse({ ...BASE, JWT_ACCESS_SECRET: 'tooshort' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors.JWT_ACCESS_SECRET ?? [];
      expect(errs.some((e) => e.includes('32'))).toBe(true);
    }
  });

  it('rejects SAO_ENGINE_SECRET shorter than 16 characters', () => {
    const result = envSchema.safeParse({ ...BASE, SAO_ENGINE_SECRET: 'tooshort' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.SAO_ENGINE_SECRET).toBeDefined();
    }
  });

  it('rejects an invalid SAO_ENGINE_URL', () => {
    const result = envSchema.safeParse({ ...BASE, SAO_ENGINE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.SAO_ENGINE_URL).toBeDefined();
    }
  });

  it('rejects missing DATABASE_URL', () => {
    const { DATABASE_URL: _, ...rest } = BASE;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.DATABASE_URL).toBeDefined();
    }
  });

  it('defaults NODE_ENV to development when omitted', () => {
    const result = envSchema.safeParse(BASE);
    if (result.success) expect(result.data.NODE_ENV).toBe('development');
  });

  it('defaults PORT to 3000 when omitted', () => {
    const result = envSchema.safeParse(BASE);
    if (result.success) expect(result.data.PORT).toBe(3000);
  });
});
