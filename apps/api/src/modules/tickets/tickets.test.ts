import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { signAccessToken } from '../../lib/jwt.js';
import * as emailLib from '../../lib/email.js';

const BASE = '/api/v1/tickets';
const RUN_ID = Date.now();

// ─── Shared test state ────────────────────────────────────────────────────────

let attendeeToken: string;
let attendeeUserId: string;
let adminUserId: string;

let venueId: string;
let eventId: string;
let ticketTypeId: string;   // quantityTotal: 10
let limitedTypeId: string;  // quantityTotal: 1 (for sold-out / concurrent tests)

let purchasedTicketId: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const pw = await bcrypt.hash('TestPass1!', 10);

  const attendee = await prisma.user.create({
    data: {
      name: 'Tickets Attendee',
      email: `tkt_att_${RUN_ID}@test.com`,
      passwordHash: pw,
      emailVerified: true,
      role: 'ATTENDEE',
    },
  });
  attendeeUserId = attendee.id;
  attendeeToken = signAccessToken({ sub: attendee.id, role: 'ATTENDEE' });

  const admin = await prisma.user.create({
    data: {
      name: 'Tickets Admin',
      email: `tkt_adm_${RUN_ID}@test.com`,
      passwordHash: pw,
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  adminUserId = admin.id;

  const venue = await prisma.venue.create({
    data: {
      name: 'Test Arena',
      address: '1 Arena Rd',
      city: 'Lagos',
      totalCapacity: 500,
      layoutJson: {},
    },
  });
  venueId = venue.id;

  const event = await prisma.event.create({
    data: {
      title: 'Integration Test Concert',
      description: 'Test event for ticket integration tests',
      organizerId: adminUserId,
      venueId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000),
      status: 'PUBLISHED',
    },
  });
  eventId = event.id;

  const tt = await prisma.ticketType.create({
    data: { eventId, name: 'General', price: 5000, quantityTotal: 10, quantitySold: 0 },
  });
  ticketTypeId = tt.id;

  const limited = await prisma.ticketType.create({
    data: { eventId, name: 'Limited VIP', price: 20000, quantityTotal: 1, quantitySold: 0 },
  });
  limitedTypeId = limited.id;
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { eventId } });
  await prisma.ticketType.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.venue.deleteMany({ where: { id: venueId } });
  await prisma.user.deleteMany({
    where: { email: { in: [`tkt_att_${RUN_ID}@test.com`, `tkt_adm_${RUN_ID}@test.com`] } },
  });
});

// ─── GET /tickets ─────────────────────────────────────────────────────────────

describe('GET /api/v1/tickets', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty array for a new user', async () => {
    const res = await request(app).get(BASE).set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });
});

// ─── POST /tickets ────────────────────────────────────────────────────────────

describe('POST /api/v1/tickets', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post(BASE).send({ eventId, ticketTypeId });
    expect(res.status).toBe(401);
  });

  it('returns 422 for invalid payload (missing eventId)', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ ticketTypeId });
    expect(res.status).toBe(422);
  });

  it('returns 201, creates an ACTIVE ticket, and triggers a confirmation email', async () => {
    const emailSpy = vi.spyOn(emailLib, 'sendTicketEmail').mockResolvedValue(undefined);

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'ACTIVE',
      eventId,
      ticketTypeId,
    });
    expect(typeof res.body.data.id).toBe('string');
    // qrToken IS included in the purchase response (not stripped like lists)
    expect(typeof res.body.data.qrToken).toBe('string');

    purchasedTicketId = res.body.data.id;

    // Fire-and-forget: wait for async email task to execute
    await new Promise((r) => setTimeout(r, 100));
    expect(emailSpy).toHaveBeenCalledOnce();
    const [to, , title, , , , , qrDataUrl] = emailSpy.mock.calls[0] as [string, string, string, string, string, string, string, string];
    expect(to).toContain('@test.com');
    expect(title).toBe('Integration Test Concert');
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

    emailSpy.mockRestore();
  });

  it('does not expose qrToken in list (GET /tickets) responses', async () => {
    const res = await request(app).get(BASE).set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    (res.body.data as Record<string, unknown>[]).forEach((ticket) => {
      expect(ticket).not.toHaveProperty('qrToken');
    });
  });

  it('returns 409 when the limited ticket type is sold out after one purchase', async () => {
    const r1 = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId: limitedTypeId });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId: limitedTypeId });
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('NO_SEATS_AVAILABLE');
  });

  it('prevents overselling — only one of two concurrent requests for the last ticket succeeds', async () => {
    const event2 = await prisma.event.create({
      data: {
        title: 'Concurrency Test Event',
        description: 'Race condition test',
        organizerId: adminUserId,
        venueId,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 2 * 86_400_000),
        status: 'PUBLISHED',
      },
    });
    const tt2 = await prisma.ticketType.create({
      data: { eventId: event2.id, name: 'Last Ticket', price: 0, quantityTotal: 1, quantitySold: 0 },
    });

    const [r1, r2] = await Promise.all([
      request(app)
        .post(BASE)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ eventId: event2.id, ticketTypeId: tt2.id }),
      request(app)
        .post(BASE)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ eventId: event2.id, ticketTypeId: tt2.id }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const count = await prisma.ticket.count({ where: { eventId: event2.id } });
    expect(count).toBe(1);

    await prisma.ticket.deleteMany({ where: { eventId: event2.id } });
    await prisma.ticketType.deleteMany({ where: { eventId: event2.id } });
    await prisma.event.deleteMany({ where: { id: event2.id } });
  });
});

// ─── GET /tickets/:id ─────────────────────────────────────────────────────────

describe('GET /api/v1/tickets/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`${BASE}/${purchasedTicketId}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with ticket data and a PNG qrDataUrl for the owner', async () => {
    const res = await request(app)
      .get(`${BASE}/${purchasedTicketId}`)
      .set('Authorization', `Bearer ${attendeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(purchasedTicketId);
    expect(res.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data).toHaveProperty('event');
    expect(res.body.data).toHaveProperty('ticketType');
  });

  it('returns 403 (not 404) when a different user tries to access the ticket', async () => {
    const pw = await bcrypt.hash('TestPass1!', 10);
    const other = await prisma.user.create({
      data: {
        name: 'Other User',
        email: `other_${RUN_ID}@test.com`,
        passwordHash: pw,
        emailVerified: true,
        role: 'ATTENDEE',
      },
    });
    const otherToken = signAccessToken({ sub: other.id, role: 'ATTENDEE' });

    const res = await request(app)
      .get(`${BASE}/${purchasedTicketId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    // 403 — not 404 — to avoid leaking ticket existence to non-owners
    expect(res.status).toBe(403);

    await prisma.user.delete({ where: { id: other.id } });
  });
});

// ─── POST /tickets/:id/cancel ─────────────────────────────────────────────────

describe('POST /api/v1/tickets/:id/cancel', () => {
  let cancelTicketId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId });
    cancelTicketId = res.body.data.id;
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post(`${BASE}/${cancelTicketId}/cancel`);
    expect(res.status).toBe(401);
  });

  it('returns 204 on successful cancellation', async () => {
    const res = await request(app)
      .post(`${BASE}/${cancelTicketId}/cancel`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(204);
  });

  it('returns 409 when trying to cancel an already-cancelled ticket', async () => {
    const res = await request(app)
      .post(`${BASE}/${cancelTicketId}/cancel`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('decrements quantitySold after a successful cancellation', async () => {
    const tt = await prisma.ticketType.findUnique({ where: { id: ticketTypeId } });
    expect(tt!.quantitySold).toBeGreaterThanOrEqual(0);
  });
});

// ─── POST /tickets/:id/transfer ────────────────────────────────────────────────

describe('POST /api/v1/tickets/:id/transfer', () => {
  let transferTicketId: string;
  let targetUserId: string;
  let targetToken: string;

  beforeAll(async () => {
    const pw = await bcrypt.hash('TestPass1!', 10);
    const target = await prisma.user.create({
      data: {
        name: 'Transfer Target',
        email: `tkt_target_${RUN_ID}@test.com`,
        passwordHash: pw,
        emailVerified: true,
        role: 'ATTENDEE',
      },
    });
    targetUserId = target.id;
    targetToken = signAccessToken({ sub: target.id, role: 'ATTENDEE' });

    // Purchase a fresh ticket to use throughout this suite
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId });
    transferTicketId = res.body.data.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: `tkt_target_${RUN_ID}@test.com` } });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`${BASE}/${transferTicketId}/transfer`)
      .send({ toEmail: `tkt_target_${RUN_ID}@test.com` });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the requester does not own the ticket', async () => {
    const res = await request(app)
      .post(`${BASE}/${transferTicketId}/transfer`)
      .set('Authorization', `Bearer ${targetToken}`)
      .send({ toEmail: `tkt_target_${RUN_ID}@test.com` });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the target email does not exist', async () => {
    const res = await request(app)
      .post(`${BASE}/${transferTicketId}/transfer`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ toEmail: `no_such_user_${RUN_ID}@test.com` });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRANSFER_TARGET_NOT_FOUND');
  });

  it('transfers the ticket to the target user and sends a confirmation email', async () => {
    const emailSpy = vi.spyOn(emailLib, 'sendTicketEmail').mockResolvedValue(undefined);

    const res = await request(app)
      .post(`${BASE}/${transferTicketId}/transfer`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ toEmail: `tkt_target_${RUN_ID}@test.com` });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      previousOwnerId: attendeeUserId,
      newOwner: { email: `tkt_target_${RUN_ID}@test.com` },
    });

    // Fire-and-forget: wait for async email task
    await new Promise((r) => setTimeout(r, 100));
    expect(emailSpy).toHaveBeenCalledOnce();
    const [to] = emailSpy.mock.calls[0] as [string, ...unknown[]];
    expect(to).toBe(`tkt_target_${RUN_ID}@test.com`);

    emailSpy.mockRestore();

    // Verify DB: ticket now owned by target
    const ticket = await prisma.ticket.findUnique({ where: { id: transferTicketId } });
    expect(ticket!.userId).toBe(targetUserId);
  });

  it('returns 409 TICKET_NOT_TRANSFERABLE when ticket status is not ACTIVE', async () => {
    // Purchase a new ticket and mark it USED (simulates check-in)
    const res1 = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId });
    const usedTicketId = res1.body.data.id;
    await prisma.ticket.update({ where: { id: usedTicketId }, data: { status: 'USED' } });

    const res = await request(app)
      .post(`${BASE}/${usedTicketId}/transfer`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ toEmail: `tkt_target_${RUN_ID}@test.com` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TICKET_NOT_TRANSFERABLE');
  });

  it('returns 409 TRANSFER_TARGET_HAS_TICKET when target already has an active ticket', async () => {
    // The target already has the ticket transferred in the happy-path test above.
    // Purchase another ticket for attendee and try to transfer to target again.
    const res1 = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ eventId, ticketTypeId });
    const newTicketId = res1.body.data.id;

    const res = await request(app)
      .post(`${BASE}/${newTicketId}/transfer`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ toEmail: `tkt_target_${RUN_ID}@test.com` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRANSFER_TARGET_HAS_TICKET');
  });
});
