import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  HMAC_SECRET: z.string().min(32),

  SAO_ENGINE_URL: z.string().url(),
  SAO_ENGINE_SECRET: z.string().min(16),

  // Optional — email sending is silently skipped when unset (useful in test/CI environments)
  RESEND_API_KEY: z.string().min(10).optional(),
  RESEND_FROM_EMAIL: z.string().email().default('tickets@eventflow.app'),
  CLOUDINARY_URL: z.string().url().optional(),

  FRONTEND_URL: z.string().url(),
  ADMIN_URL: z.string().url(),

  // Used to build email verification links (API base URL)
  API_URL: z.string().url().default('http://localhost:3001'),

  // Comma-separated list of allowed CORS origins; transformed to string[]
  CORS_ORIGINS: z
    .string()
    .transform((s) => s.split(',').map((o) => o.trim()))
    .default('http://localhost:5173,http://localhost:5174'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  // Dev-only: redirect all outbound emails to this address instead of the real recipient
  DEV_EMAIL_RECIPIENT: z.string().email().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Use console here intentionally — logger may not be initialised yet at boot
  // eslint-disable-next-line no-console
  console.error('[env] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
