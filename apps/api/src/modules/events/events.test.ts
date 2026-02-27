import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { signAccessToken } from '../../lib/jwt.js';

const BASE = '/api/v1/events';
const RUN_ID = Date.now();

let adminToken: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      name: 'Events Admin',
      email: `events_admin_${RUN_ID}@example.com`,
      passwordHash: 'x',
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  adminToken = signAccessToken({ sub: admin.id, role: 'ADMIN' });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { contains: `_${RUN_ID}@example.com` } },
  });
});

// ─── GET /events ──────────────────────────────────────────────────────────────

describe('GET /api/v1/events', () => {
  it('returns 200 with paginated result object for unauthenticated users', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // data is now an object { events, total, page, limit }
    expect(res.body.data).toHaveProperty('events');
    expect(Array.isArray(res.body.data.events)).toBe(true);
    expect(res.body.meta).toMatchObject({
      page: expect.any(Number),
      total: expect.any(Number),
      limit: expect.any(Number),
    });
  });

  it('unauthenticated users see only PUBLISHED events', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    for (const ev of res.body.data.events as { status: string }[]) {
      expect(ev.status).toBe('PUBLISHED');
    }
  });

  it('admin with token can filter by any status', async () => {
    const res = await request(app)
      .get(`${BASE}?status=DRAFT`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('events');
  });
});

// ─── GET /events/:id ─────────────────────────────────────────────────────────

describe('GET /api/v1/events/:id', () => {
  it('returns 404 for a non-existent uuid', async () => {
    const res = await request(app).get(`${BASE}/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });

  it('returns 422 for a non-uuid param', async () => {
    const res = await request(app).get(`${BASE}/not-a-uuid`);
    expect(res.status).toBe(422);
  });
});

// ─── POST /events ─────────────────────────────────────────────────────────────

describe('POST /api/v1/events', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post(BASE).send({});
    expect(res.status).toBe(401);
  });

  it('returns 422 with invalid body', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'X' });
    expect(res.status).toBe(422);
  });
});

// ─── PATCH /events/:id/status ─────────────────────────────────────────────────

describe('PATCH /api/v1/events/:id/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .patch(`${BASE}/00000000-0000-0000-0000-000000000000/status`)
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /events/:id ───────────────────────────────────────────────────────

describe('DELETE /api/v1/events/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete(`${BASE}/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(401);
  });
});
