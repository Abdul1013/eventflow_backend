import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { signAccessToken } from '../../lib/jwt.js';
import { saoClient } from '../../lib/saoClient.js';

const BASE = '/api/v1/events';
const RUN_ID = Date.now();

let adminToken: string;
let adminId: string;

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
  adminId = admin.id;
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

// ─── SAO Allocation ───────────────────────────────────────────────────────────

describe('SAO Allocation', () => {
  let allocationEventId: string;
  let venueId: string;
  let seats: { id: string; rowLabel: string; seatNumber: string }[];
  let ticketTypeId: string;
  let tickets: { id: string; userId: string }[];

  beforeAll(async () => {
    // Create venue with 20 seats
    const venue = await prisma.venue.create({
      data: {
        name: `SAO Test Venue ${RUN_ID}`,
        address: '1 SAO St',
        city: 'Lagos',
        totalCapacity: 20,
        layoutJson: {},
        seats: {
          create: Array.from({ length: 20 }, (_, i) => ({
            rowLabel: 'A',
            seatNumber: String(i + 1),
            xCoord: i * 1.5,
            yCoord: 0.0,
            isAccessible: false,
          })),
        },
      },
      include: { seats: true },
    });
    venueId = venue.id;
    seats = venue.seats.map((s: { id: string; rowLabel: string; seatNumber: string }) => ({ id: s.id, rowLabel: s.rowLabel, seatNumber: s.seatNumber }));

    // Create PUBLISHED event with one ticket type
    const event = await prisma.event.create({
      data: {
        title: `SAO Test Event ${RUN_ID}`,
        description: 'SAO allocation integration test event',
        organizerId: adminId,
        venueId: venue.id,
        startsAt: new Date('2027-06-01T10:00:00Z'),
        endsAt: new Date('2027-06-01T22:00:00Z'),
        status: 'PUBLISHED',
        ticketTypes: {
          create: [{ name: 'General', price: 0, quantityTotal: 20 }],
        },
      },
      include: { ticketTypes: true },
    });
    allocationEventId = event.id;
    ticketTypeId = event.ticketTypes[0].id;

    // Create 10 attendee users + tickets
    tickets = [];
    for (let i = 0; i < 10; i++) {
      const user = await prisma.user.create({
        data: {
          name: `SAO Attendee ${i}`,
          email: `sao_attendee_${i}_${RUN_ID}@example.com`,
          passwordHash: 'x',
          emailVerified: true,
          role: 'ATTENDEE',
        },
      });
      const ticket = await prisma.ticket.create({
        data: {
          userId: user.id,
          eventId: event.id,
          ticketTypeId,
          qrToken: `sao-qr-${i}-${RUN_ID}`,
          status: 'ACTIVE',
        },
      });
      tickets.push({ id: ticket.id, userId: user.id });
    }
  });

  afterAll(async () => {
    await prisma.allocation.deleteMany({ where: { eventId: allocationEventId } });
    await prisma.ticket.deleteMany({ where: { eventId: allocationEventId } });
    await prisma.ticketType.deleteMany({ where: { eventId: allocationEventId } });
    await prisma.event.delete({ where: { id: allocationEventId } });
    await prisma.seat.deleteMany({ where: { venueId } });
    await prisma.venue.delete({ where: { id: venueId } });
    // Attendee users are cleaned by the outer afterAll (emails contain `_${RUN_ID}@example.com`)
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────────

  describe('POST /api/v1/events/:id/allocate — happy path', () => {
    beforeAll(() => {
      vi.spyOn(saoClient, 'run').mockResolvedValue({
        eventId: allocationEventId,
        algorithmUsed: 'kmeans_greedy',
        assignments: tickets.map((t, i) => ({
          ticketId: t.id,
          userId: t.userId,
          seatId: seats[i].id,
          rowLabel: seats[i].rowLabel,
          seatNumber: seats[i].seatNumber,
          section: null,
        })),
        utilizationRate: 0.5,
        adjacencyScore: 0.9,
        seatsAssigned: 10,
        seatsTotal: 20,
        seatsAccessibleUsed: 0,
        unassignedTicketIds: [],
        durationMs: 42,
      });
    });

    afterAll(async () => {
      vi.restoreAllMocks();
      await prisma.ticket.updateMany({ where: { eventId: allocationEventId }, data: { seatId: null } });
      await prisma.allocation.deleteMany({ where: { eventId: allocationEventId } });
    });

    it('assigns all 10 tickets a seatId, creates one Allocation record, and returns utilizationRate', async () => {
      const res = await request(app)
        .post(`${BASE}/${allocationEventId}/allocate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('utilizationRate', 0.5);

      const updatedTickets = await prisma.ticket.findMany({
        where: { eventId: allocationEventId },
        select: { seatId: true },
      });
      expect(updatedTickets.every((t: { seatId: string | null }) => t.seatId !== null)).toBe(true);

      const allocations = await prisma.allocation.findMany({ where: { eventId: allocationEventId } });
      expect(allocations).toHaveLength(1);
      expect(allocations[0].algorithmUsed).toBe('kmeans_greedy');
    });
  });

  // ── 2. DRAFT event → 409 ─────────────────────────────────────────────────

  describe('POST /api/v1/events/:id/allocate — DRAFT event', () => {
    let draftEventId: string;

    beforeAll(async () => {
      const ev = await prisma.event.create({
        data: {
          title: `Draft Alloc Test ${RUN_ID}`,
          description: 'draft',
          organizerId: adminId,
          venueId,
          startsAt: new Date('2027-06-01T10:00:00Z'),
          endsAt: new Date('2027-06-01T22:00:00Z'),
          status: 'DRAFT',
        },
      });
      draftEventId = ev.id;
    });

    afterAll(async () => {
      await prisma.event.delete({ where: { id: draftEventId } });
    });

    it('returns 409 EVENT_NOT_ALLOCATABLE', async () => {
      const res = await request(app)
        .post(`${BASE}/${draftEventId}/allocate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_NOT_ALLOCATABLE');
    });
  });

  // ── 3. Compare endpoint ───────────────────────────────────────────────────

  describe('POST /api/v1/events/:id/allocate/compare', () => {
    beforeAll(() => {
      vi.spyOn(saoClient, 'compare').mockResolvedValue({
        eventId: allocationEventId,
        saoUtilizationRate: 0.85,
        baselineUtilizationRate: 0.65,
        saoAdjacencyScore: 0.9,
        baselineAdjacencyScore: 0.7,
        improvementPercentage: 30.77,
        hypothesisH1Passed: true,
      });
    });

    afterAll(async () => {
      vi.restoreAllMocks();
      await prisma.allocation.deleteMany({ where: { eventId: allocationEventId } });
    });

    it('returns BaselineComparisonSchema shape and creates 2 Allocation records', async () => {
      const res = await request(app)
        .post(`${BASE}/${allocationEventId}/allocate/compare`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        saoUtilizationRate: 0.85,
        baselineUtilizationRate: 0.65,
        improvementPercentage: expect.any(Number),
        hypothesisH1Passed: true,
      });

      const allocations = await prisma.allocation.findMany({ where: { eventId: allocationEventId } });
      expect(allocations).toHaveLength(2);
      const algos = allocations.map((a: { algorithmUsed: string }) => a.algorithmUsed).sort();
      expect(algos).toEqual(['kmeans_greedy', 'manual_baseline']);
    });
  });

  // ── 4. GET /allocations — ordered DESC ────────────────────────────────────

  describe('GET /api/v1/events/:id/allocations', () => {
    let olderAllocationId: string;
    let newerAllocationId: string;

    beforeAll(async () => {
      const older = await prisma.allocation.create({
        data: {
          eventId: allocationEventId,
          algorithmUsed: 'manual_baseline',
          utilizationRate: 0.6,
          runAt: new Date('2026-01-01T10:00:00Z'),
          seatMapJson: [],
        },
      });
      const newer = await prisma.allocation.create({
        data: {
          eventId: allocationEventId,
          algorithmUsed: 'kmeans_greedy',
          utilizationRate: 0.8,
          runAt: new Date('2026-06-01T10:00:00Z'),
          seatMapJson: [],
        },
      });
      olderAllocationId = older.id;
      newerAllocationId = newer.id;
    });

    afterAll(async () => {
      await prisma.allocation.deleteMany({ where: { eventId: allocationEventId } });
    });

    it('returns allocations ordered by runAt DESC', async () => {
      const res = await request(app)
        .get(`${BASE}/${allocationEventId}/allocations`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const returnedIds = (res.body.data as { id: string }[]).map((a) => a.id);
      expect(returnedIds.indexOf(newerAllocationId)).toBeLessThan(returnedIds.indexOf(olderAllocationId));
    });
  });

  // ── 5. GET /seats — status field ─────────────────────────────────────────

  describe('GET /api/v1/events/:id/seats', () => {
    beforeAll(async () => {
      // seats[0] → ACTIVE ticket → ALLOCATED
      await prisma.ticket.update({
        where: { id: tickets[0].id },
        data: { seatId: seats[0].id, status: 'ACTIVE' },
      });
      // seats[1] → USED ticket → CHECKED_IN
      await prisma.ticket.update({
        where: { id: tickets[1].id },
        data: { seatId: seats[1].id, status: 'USED' },
      });
      // seats[2..19] have no ticket → AVAILABLE
    });

    afterAll(async () => {
      await prisma.ticket.updateMany({
        where: { eventId: allocationEventId },
        data: { seatId: null, status: 'ACTIVE' },
      });
    });

    it('returns AVAILABLE, ALLOCATED, and CHECKED_IN seat statuses correctly', async () => {
      const res = await request(app)
        .get(`${BASE}/${allocationEventId}/seats`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eventId).toBe(allocationEventId);

      const seatList = res.body.data.seats as { id: string; status: string }[];
      expect(seatList).toHaveLength(20);

      const byId = new Map(seatList.map((s) => [s.id, s]));
      expect(byId.get(seats[0].id)?.status).toBe('ALLOCATED');
      expect(byId.get(seats[1].id)?.status).toBe('CHECKED_IN');
      expect(byId.get(seats[2].id)?.status).toBe('AVAILABLE');
    });
  });
});
