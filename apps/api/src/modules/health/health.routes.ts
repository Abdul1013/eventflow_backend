import { Router, type IRouter } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';

export const healthRouter: IRouter = Router();

// GET /health — always public, never rate-limited
// Returns system health for Railway healthcheck and monitoring
healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk, saoOk] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
      fetch(`${env.SAO_ENGINE_URL}/health`, { signal: AbortSignal.timeout(2000) }),
    ]);

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: dbOk.status === 'fulfilled' ? 'ok' : 'error',
        redis:    redisOk.status === 'fulfilled' ? 'ok' : 'error',
        sao:      saoOk.status === 'fulfilled' ? 'ok' : 'degraded',
      },
    };

    // Return 200 even if SAO is degraded (non-critical for check-in)
    // Return 503 only if DB or Redis is down
    const isHealthy =
      health.services.database === 'ok' && health.services.redis === 'ok';

    res.status(isHealthy ? 200 : 503).json(health);
  }),
);
