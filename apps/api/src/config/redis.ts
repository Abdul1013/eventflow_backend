import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../lib/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  // Never crash on Redis disconnect — log and continue
  logger.error({ err }, '[redis] Connection error');
});

redis.on('connect', () => {
  logger.info('[redis] Connected');
});

// ─── Typed helpers ────────────────────────────────────────────────────────────

/** Set a key with a TTL in seconds. Returns 'OK'. */
export const redisSet = (key: string, ttlSeconds: number, value: string): Promise<'OK'> =>
  redis.set(key, value, 'EX', ttlSeconds);

/** Get a key value, or null if missing/expired. */
export const redisGet = (key: string): Promise<string | null> => redis.get(key);

/** Delete one or more keys. Returns count of deleted keys. */
export const redisDel = (...keys: string[]): Promise<number> => redis.del(...keys);
