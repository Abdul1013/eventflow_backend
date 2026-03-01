import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';

beforeAll(async () => {
  // In CI, DATABASE_URL and REDIS_URL should point to test instances
  await prisma.$connect();
  await redis.connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});
