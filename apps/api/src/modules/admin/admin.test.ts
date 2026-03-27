import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { signAccessToken } from '../../lib/jwt.js';

const BASE = '/api/v1/admin';
const RUN_ID = Date.now();

const adminEmail = `admin_test_${RUN_ID}@example.com`;
const attendeeEmail = `attendee_test_${RUN_ID}@example.com`;

let adminToken: string;
let attendeeToken: string;
let adminUserId: string;
let attendeeUserId: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const pw = await bcrypt.hash('TestPass1', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: adminEmail,
      passwordHash: pw,
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  adminUserId = admin.id;
  adminToken = signAccessToken({ sub: admin.id, role: 'ADMIN' });

  const attendee = await prisma.user.create({
    data: {
      name: 'Test Attendee',
      email: attendeeEmail,
      passwordHash: pw,
      emailVerified: true,
      role: 'ATTENDEE',
    },
  });
  attendeeUserId = attendee.id;
  attendeeToken = signAccessToken({ sub: attendee.id, role: 'ATTENDEE' });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [adminEmail, attendeeEmail] } },
  });
});

// ─── GET /admin/stats ─────────────────────────────────────────────────────────

describe('GET /admin/stats', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/stats`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin (ATTENDEE)', async () => {
    const res = await request(app)
      .get(`${BASE}/stats`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with all four stat fields for an admin', async () => {
    const res = await request(app)
      .get(`${BASE}/stats`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(typeof data.totalEvents).toBe('number');
    expect(typeof data.ticketsSold).toBe('number');
    expect(typeof data.todaysCheckIns).toBe('number');
    expect(typeof data.totalUsers).toBe('number');
  });
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/users`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin (ATTENDEE)', async () => {
    const res = await request(app)
      .get(`${BASE}/users`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with users array and pagination meta', async () => {
    const res = await request(app)
      .get(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({
      page: expect.any(Number),
      total: expect.any(Number),
      limit: expect.any(Number),
    });
  });

  it('does not expose passwordHash in any user record', async () => {
    const res = await request(app)
      .get(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const user of res.body.data as Record<string, unknown>[]) {
      expect(user).not.toHaveProperty('passwordHash');
    }
  });
});

// ─── PATCH /admin/users/:id/role ──────────────────────────────────────────────

describe('PATCH /admin/users/:id/role', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/${attendeeUserId}/role`)
      .send({ role: 'STAFF' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin (ATTENDEE)', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/${attendeeUserId}/role`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ role: 'STAFF' });
    expect(res.status).toBe(403);
  });

  it('returns 422 for an invalid role value', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/${attendeeUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'SUPERUSER' });
    expect(res.status).toBe(422);
  });

  it('returns 403 CANNOT_DEMOTE_SELF when admin tries to change their own role', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/${adminUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'ATTENDEE' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_DEMOTE_SELF');
  });

  it('successfully updates a user role and returns the updated user', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/${attendeeUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'STAFF' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('STAFF');
    expect(res.body.data).not.toHaveProperty('passwordHash');

    // Restore original role
    await prisma.user.update({
      where: { id: attendeeUserId },
      data: { role: 'ATTENDEE' },
    });
  });
});

// ─── GET /admin/tickets/:id ───────────────────────────────────────────────────

describe('GET /admin/tickets/:id', () => {
  let fixtureTicketId: string;
  let fixtureVenueId: string;
  let fixtureEventId: string;
  let fixtureTypeId: string;

  beforeAll(async () => {
    const venue = await prisma.venue.create({
      data: {
        name: 'Admin Test Venue',
        address: '1 Admin Rd',
        city: 'Lagos',
        totalCapacity: 100,
        layoutJson: {},
      },
    });
    fixtureVenueId = venue.id;

    const event = await prisma.event.create({
      data: {
        title: 'Admin Ticket Test Event',
        description: 'Test',
        organizerId: adminUserId,
        venueId: fixtureVenueId,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 2 * 86_400_000),
        status: 'PUBLISHED',
      },
    });
    fixtureEventId = event.id;

    const tt = await prisma.ticketType.create({
      data: { eventId: fixtureEventId, name: 'Standard', price: 1000, quantityTotal: 5, quantitySold: 0 },
    });
    fixtureTypeId = tt.id;

    const ticket = await prisma.ticket.create({
      data: {
        userId: attendeeUserId,
        eventId: fixtureEventId,
        ticketTypeId: fixtureTypeId,
        qrToken: `test-qr-${RUN_ID}`,
        status: 'ACTIVE',
      },
    });
    fixtureTicketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { eventId: fixtureEventId } });
    await prisma.ticketType.deleteMany({ where: { eventId: fixtureEventId } });
    await prisma.event.deleteMany({ where: { id: fixtureEventId } });
    await prisma.venue.deleteMany({ where: { id: fixtureVenueId } });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/tickets/${fixtureTicketId}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin (ATTENDEE)', async () => {
    const res = await request(app)
      .get(`${BASE}/tickets/${fixtureTicketId}`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with full ticket detail including qrDataUrl for admin', async () => {
    const res = await request(app)
      .get(`${BASE}/tickets/${fixtureTicketId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(fixtureTicketId);
    expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data).toHaveProperty('event');
  });

  it('returns 404 for a non-existent ticket id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`${BASE}/tickets/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
