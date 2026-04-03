import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { redis } from './config/redis.js';
import { logger } from './lib/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(`EventFlow API running on port ${env.PORT} [${env.NODE_ENV}]`);
});

// Graceful shutdown — Railway sends SIGTERM before killing the container
const shutdown = async (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    await redis.quit();
    logger.info('All connections closed — process exiting');
    process.exit(0);
  });
  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced exit after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — shutting down');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection — shutting down');
  shutdown('unhandledRejection');
});
