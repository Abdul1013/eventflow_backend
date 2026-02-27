import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { signAccessToken } from '../../lib/jwt.js';

const BASE = '/api/v1/venues';
const RUN_ID = Date.now();

let adminToken: string;
let attendeeToken: string;

//  Setup / Teardown 
beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      name: 'Venue Admin',
      email: `venue_admin_${RUN_ID}@example.com`,
      passwordHash: 'x',
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  adminToken = signAccessToken({ sub: admin.id, role: 'ADMIN' });

  const attendee = await prisma.user.create({
    data: {
      name: 'Venue Attendee',
      email: `venue_attendee_${RUN_ID}@example.com`,
      passwordHash: 'x',
      emailVerified: true,
      role: 'ATTENDEE',
    },
  });
  attendeeToken = signAccessToken({ sub: attendee.id, role: 'ATTENDEE' });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { contains: `_${RUN_ID}@example.com` } },
  });
});

//  GET /venues 
describe('GET /api/v1/venues', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with an array for admin', async () => {
    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

//  POST /venues 
describe('POST /api/v1/venues', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post(BASE).send({});
    expect(res.status).toBe(401);
  });

  it('returns 422 with invalid body', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' }); // too short, missing required fields
    expect(res.status).toBe(422);
  });

  it('returns 201 with venue + seats for valid payload', async () => {
    const payload = {
      name: `Test Venue ${RUN_ID}`,
      address: '123 Test Street',
      city: 'Lagos',
      totalCapacity: 4,
      layoutJson: {
        rows: [
          {
            label: 'A',
            seats: [
              { number: '1', x: 20, y: 20, accessible: false },
              { number: '2', x: 45, y: 20, accessible: true },
            ],
          },
          {
            label: 'B',
            seats: [
              { number: '1', x: 20, y: 50, accessible: false },
              { number: '2', x: 45, y: 50, accessible: false },
            ],
          },
        ],
      },
    };

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(payload.name);
    expect(Array.isArray(res.body.data.seats)).toBe(true);
    expect(res.body.data.seats).toHaveLength(4);

    // Clean up created venue + its seats (cascade not set — delete seats first)
    await prisma.seat.deleteMany({ where: { venueId: res.body.data.id } });
    await prisma.venue.delete({ where: { id: res.body.data.id } });
  });
});

//  GET /venues/:id 
describe('GET /api/v1/venues/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown uuid', async () => {
    const res = await request(app)
      .get(`${BASE}/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
