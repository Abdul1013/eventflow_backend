import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../app.js';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { signAccessToken } from '../../lib/jwt.js';
import { generateQrToken } from '../../lib/qr.js';

const BASE = '/api/v1/checkin';
const RUN_ID = Date.now();

// ─── Shared test state 

let adminToken: string;
let adminUserId: string;
let staffToken: string;
let staffUserId: string;
let attendeeToken: string;
let attendeeUserId: string;

let venueId: string;
let eventId: string;       // PUBLISHED event (main)
let draftEventId: string;  // DRAFT event for EVENT_NOT_ACTIVE tests
let ticketTypeId: string;

// ─── Setup / Teardown ─

beforeAll(async () => {
  const pw = await bcrypt.hash('TestPass1!', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'CI Admin',
      email: `ci_admin_${RUN_ID}@test.com`,
      passwordHash: pw,
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  adminUserId = admin.id;
  adminToken = signAccessToken({ sub: admin.id, role: 'ADMIN' });

  const staff = await prisma.user.create({
    data: {
      name: 'CI Staff',
      email: `ci_staff_${RUN_ID}@test.com`,
      passwordHash: pw,
      emailVerified: true,
      role: 'STAFF',
    },
  });
  staffUserId = staff.id;
  staffToken = signAccessToken({ sub: staff.id, role: 'STAFF' });

  const attendee = await prisma.user.create({
    data: {
      name: 'CI Attendee',
      email: `ci_att_${RUN_ID}@test.com`,
      passwordHash: pw,
      emailVerified: true,
      role: 'ATTENDEE',
    },
  });
  attendeeUserId = attendee.id;
  attendeeToken = signAccessToken({ sub: attendee.id, role: 'ATTENDEE' });

  const venue = await prisma.venue.create({
    data: {
      name: 'CI Test Arena',
      address: '1 Test Rd',
      city: 'Lagos',
      totalCapacity: 100,
      layoutJson: {},
    },
  });
  venueId = venue.id;

  const event = await prisma.event.create({
    data: {
      title: 'CI Check-in Concert',
      description: 'Integration test event for check-in module',
      organizerId: adminUserId,
      venueId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000),
      status: 'PUBLISHED',
    },
  });
  eventId = event.id;

  const draftEvent = await prisma.event.create({
    data: {
      title: 'CI Draft Event',
      description: 'DRAFT — check-in should be blocked',
      organizerId: adminUserId,
      venueId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000),
      status: 'DRAFT',
    },
  });
  draftEventId = draftEvent.id;

  const tt = await prisma.ticketType.create({
    data: { eventId, name: 'General', price: 5000, quantityTotal: 50, quantitySold: 0 },
  });
  ticketTypeId = tt.id;
});

afterAll(async () => {
  // Deletion order must respect FK constraints: logs → tickets → types → events → venues → users
  await prisma.checkInLog.deleteMany({
    where: { ticket: { eventId: { in: [eventId, draftEventId] } } },
  });
  await prisma.ticket.deleteMany({ where: { eventId: { in: [eventId, draftEventId] } } });
  await prisma.ticketType.deleteMany({ where: { eventId: { in: [eventId, draftEventId] } } });
  await prisma.event.deleteMany({ where: { id: { in: [eventId, draftEventId] } } });
  await prisma.venue.deleteMany({ where: { id: venueId } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          `ci_admin_${RUN_ID}@test.com`,
          `ci_staff_${RUN_ID}@test.com`,
          `ci_att_${RUN_ID}@test.com`,
        ],
      },
    },
  });
});

// ─── Helper 

/**
 * Creates a ticket directly in the DB and registers its QR token in Redis.
 * Mirrors what `purchaseTicket` does, giving tests full control over ticket state.
 */
async function seedTicket(
  status: 'ACTIVE' | 'USED' | 'CANCELLED' | 'TRANSFERRED' = 'ACTIVE',
  targetEventId = eventId,
) {
  // Ensure a TicketType exists for the target event (needed for non-main events)
  let ttId = ticketTypeId;
  if (targetEventId !== eventId) {
    const existing = await prisma.ticketType.findFirst({ where: { eventId: targetEventId } });
    if (existing) {
      ttId = existing.id;
    } else {
      const created = await prisma.ticketType.create({
        data: { eventId: targetEventId, name: 'General', price: 0, quantityTotal: 10, quantitySold: 0 },
      });
      ttId = created.id;
    }
  }

  const ticketId = crypto.randomUUID();
  const qrToken = generateQrToken(ticketId);

  const ticket = await prisma.ticket.create({
    data: { id: ticketId, userId: attendeeUserId, eventId: targetEventId, ticketTypeId: ttId, qrToken, status },
  });

  // Always plant the token in Redis so the scanner has something to consume.
  // This is intentional even for CANCELLED / USED tickets — it simulates the
  // edge case where Redis was not cleaned up when the ticket was invalidated.
  await redis.set(`qr:${qrToken}`, ticketId, 'EX', 86_400);

  return ticket;
}

// ─── POST /checkin/scan — RBAC cribe('POST /api/v1/checkin/scan — RBAC', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).post(`${BASE}/scan`).send({ token: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when an ATTENDEE calls the scan endpoint', async () => {
    const res = await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ token: 'any-token' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ─── POST /checkin/scan — scan outcomes ──────────────────────────────────────

describe('POST /api/v1/checkin/scan — scan outcomes (always HTTP 200)', () => {
  it('INVALID_TOKEN — unknown token not in Redis', async () => {
    const res = await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: 'not-in-redis-at-all' });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('INVALID_TOKEN');
  });

  it('INVALID_TOKEN — forged token (valid structure in Redis, bad HMAC)', async () => {
    // Build a token that passes base64url decode and has the right segment count,
    // but whose HMAC does not match the payload.
    const realToken = generateQrToken(crypto.randomUUID());
    const raw = Buffer.from(realToken, 'base64url').toString('utf-8');
    const parts = raw.split('.');
    // Flip one hex digit — keeps valid hex format but breaks the HMAC
    const badHmac = parts[2][0] === '0' ? '1' + parts[2].slice(1) : '0' + parts[2].slice(1);
    const forgedToken = Buffer.from([parts[0], parts[1], badHmac].join('.')).toString('base64url');

    // Plant the forged token in Redis so steps 1 and 2 pass; step 3 (HMAC) must fail
    const dummyTicketId = crypto.randomUUID();
    await redis.set(`qr:${forgedToken}`, dummyTicketId, 'EX', 86_400);

    const res = await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: forgedToken });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('INVALID_TOKEN');
    // Lua GET+DEL consumed the key — it must not linger in Redis
    expect(await redis.get(`qr:${forgedToken}`)).toBeNull();
  });

  it('TICKET_CANCELLED — cancelled ticket restores the Redis token', async () => {
    const ticket = await seedTicket('CANCELLED');

    const res = await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: ticket.qrToken });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('TICKET_CANCELLED');

    // Token must be restored so staff get a clear error if they scan again
    expect(await redis.get(`qr:${ticket.qrToken}`)).toBe(ticket.id);

    // Cleanup
    await redis.del(`qr:${ticket.qrToken}`);
  });

  it('EVENT_NOT_ACTIVE — DRAFT event restores the Redis token', async () => {
    const ticket = await seedTicket('ACTIVE', draftEventId);

    const res = await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: ticket.qrToken });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('EVENT_NOT_ACTIVE');

    // Token must be restored
    expect(await redis.get(`qr:${ticket.qrToken}`)).toBe(ticket.id);

    // Cleanup
    await redis.del(`qr:${ticket.qrToken}`);
  });

  it('VALID — marks ticket USED, creates CheckInLog, deletes Redis key', async () => {
    const ticket = await seedTicket('ACTIVE');

    const res = await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: ticket.qrToken, deviceInfo: 'iPhone 15 / iOS 17' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.result).toBe('VALID');
    expect(typeof res.body.data.attendeeName).toBe('string');
    expect(typeof res.body.data.eventTitle).toBe('string');
    expect(typeof res.body.data.seatInfo).toBe('string');
    expect(typeof res.body.data.ticketType).toBe('string');

    // Redis key must be gone immediately (consumed by Lua GET+DEL)
    expect(await redis.get(`qr:${ticket.qrToken}`)).toBeNull();

    // Fire-and-forget DB write — wait for it to land
    await new Promise((r) => setTimeout(r, 150));

    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated!.status).toBe('USED');
    expect(updated!.checkInAt).not.toBeNull();

    const log = await prisma.checkInLog.findFirst({
      where: { ticketId: ticket.id, staffUserId, result: 'VALID' },
    });
    expect(log).not.toBeNull();
    expect(log!.deviceInfo).toBe('iPhone 15 / iOS 17');
  });

  it('ALREADY_USED — concurrent scans of same token: exactly one VALID, one ALREADY_USED', async () => {
    const ticket = await seedTicket('ACTIVE');

    // Fire both requests simultaneously — only one Lua GET+DEL can succeed
    const [r1, r2] = await Promise.all([
      request(app)
        .post(`${BASE}/scan`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ token: ticket.qrToken }),
      request(app)
        .post(`${BASE}/scan`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ token: ticket.qrToken }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const results = [r1.body.data.result, r2.body.data.result].sort();
    expect(results).toEqual(['ALREADY_USED', 'VALID']);

    // Redis key consumed — must be absent
    expect(await redis.get(`qr:${ticket.qrToken}`)).toBeNull();

    // DB must show exactly USED (not double-written)
    await new Promise((r) => setTimeout(r, 150));
    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated!.status).toBe('USED');
  });
});

// ─── POST /checkin/manual 

describe('POST /api/v1/checkin/manual', () => {
  it('returns 403 when a STAFF user calls the manual endpoint', async () => {
    const res = await request(app)
      .post(`${BASE}/manual`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ticketId: crypto.randomUUID() });

    expect(res.status).toBe(403);
  });

  it('returns 409 TICKET_NOT_ACTIVE when ticket status is USED', async () => {
    const usedTicket = await prisma.ticket.create({
      data: {
        userId: attendeeUserId,
        eventId,
        ticketTypeId,
        qrToken: generateQrToken(crypto.randomUUID()),
        status: 'USED',
        checkInAt: new Date(),
      },
    });

    const res = await request(app)
      .post(`${BASE}/manual`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ticketId: usedTicket.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TICKET_NOT_ACTIVE');
  });

  it('happy path — marks ticket USED, creates CheckInLog, invalidates Redis token', async () => {
    const ticket = await seedTicket('ACTIVE');
    // Confirm token is in Redis before the manual check-in
    expect(await redis.get(`qr:${ticket.qrToken}`)).toBe(ticket.id);

    const res = await request(app)
      .post(`${BASE}/manual`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ticketId: ticket.id });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('VALID');
    expect(typeof res.body.data.attendeeName).toBe('string');

    // Manual check-in is synchronous — DB must be updated immediately
    const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(updated!.status).toBe('USED');
    expect(updated!.checkInAt).not.toBeNull();

    const log = await prisma.checkInLog.findFirst({
      where: { ticketId: ticket.id, staffUserId: adminUserId, result: 'VALID' },
    });
    expect(log).not.toBeNull();

    // QR token must be removed from Redis (synchronous in manualCheckin)
    expect(await redis.get(`qr:${ticket.qrToken}`)).toBeNull();
  });
});

// ─── GET /checkin/stats/:eventId ──────────────────────────────────────────────

describe('GET /api/v1/checkin/stats/:eventId', () => {
  it('returns 403 when an ATTENDEE calls the stats endpoint', async () => {
    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${attendeeToken}`);

    expect(res.status).toBe(403);
  });

  it('returns correct counts and a recentScans array', async () => {
    // Seed two fresh tickets; check one in via the synchronous manual endpoint
    const t1 = await seedTicket('ACTIVE');
    const t2 = await seedTicket('ACTIVE');

    await request(app)
      .post(`${BASE}/manual`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ticketId: t1.id });

    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stats = res.body.data;

    // Shape
    expect(typeof stats.totalTickets).toBe('number');
    expect(typeof stats.checkedIn).toBe('number');
    expect(typeof stats.remaining).toBe('number');
    expect(typeof stats.checkInRate).toBe('number');
    expect(typeof stats.errorCount).toBe('number');
    expect(Array.isArray(stats.recentScans)).toBe(true);

    // Arithmetic
    expect(stats.totalTickets).toBe(stats.checkedIn + stats.remaining);
    expect(stats.checkedIn).toBeGreaterThanOrEqual(1);
    expect(stats.remaining).toBeGreaterThanOrEqual(1);
    expect(stats.checkInRate).toBeCloseTo((stats.checkedIn / stats.totalTickets) * 100, 2);

    // recentScans entry shape
    expect(stats.recentScans.length).toBeGreaterThan(0);
    const entry = stats.recentScans[0] as Record<string, unknown>;
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('scannedAt');
    expect(entry).toHaveProperty('result');
    expect(entry).toHaveProperty('attendeeName');

    // Cleanup t2's Redis entry (t1 was consumed by manual check-in)
    await redis.del(`qr:${t2.qrToken}`);
  });
});

// ─── POST /checkin/scan — Lua atomicity & cache invalidation ─────────────────

describe('POST /api/v1/checkin/scan — Lua atomicity & cache invalidation', () => {
  it('concurrent scans produce exactly one CheckInLog entry (Lua GET+DEL guarantees atomicity)', async () => {
    const ticket = await seedTicket('ACTIVE');

    // Two simultaneous scans — only one Lua GET+DEL succeeds, so only one VALID log is written
    await Promise.all([
      request(app)
        .post(`${BASE}/scan`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ token: ticket.qrToken }),
      request(app)
        .post(`${BASE}/scan`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ token: ticket.qrToken }),
    ]);

    // Wait for the fire-and-forget DB write to land
    await new Promise((r) => setTimeout(r, 150));

    const logs = await prisma.checkInLog.findMany({ where: { ticketId: ticket.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].result).toBe('VALID');
  });

  it('VALID scan deletes the checkin_stats cache key from Redis', async () => {
    // Seed stale stats so we can verify they are invalidated
    await redis.set(`checkin_stats:${eventId}`, JSON.stringify({ stale: true }), 'EX', 25);
    expect(await redis.get(`checkin_stats:${eventId}`)).not.toBeNull();

    const ticket = await seedTicket('ACTIVE');
    await request(app)
      .post(`${BASE}/scan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: ticket.qrToken });

    // Fire-and-forget includes redis.del(statsCacheKey) — wait for it to land
    await new Promise((r) => setTimeout(r, 150));

    expect(await redis.get(`checkin_stats:${eventId}`)).toBeNull();
  });
});

// ─── GET /checkin/stats/:eventId — cache behaviour ────────────────────────────

describe('GET /api/v1/checkin/stats/:eventId — cache behaviour', () => {
  beforeEach(async () => {
    // Always start each cache test with a cold cache
    await redis.del(`checkin_stats:${eventId}`);
  });

  it('first call returns cacheHit: false', async () => {
    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cacheHit).toBe(false);
  });

  it('first call writes the stats payload to the Redis cache key', async () => {
    await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    // setex is fire-and-forget — give it one event-loop tick to land
    await new Promise((r) => setTimeout(r, 50));

    const raw = await redis.get(`checkin_stats:${eventId}`);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed).toHaveProperty('totalTickets');
    expect(parsed).toHaveProperty('checkedIn');
    expect(parsed).toHaveProperty('checkInRate');
  });

  it('second call within TTL returns cacheHit: true', async () => {
    // Populate the cache via the first call
    await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    await new Promise((r) => setTimeout(r, 50)); // let setex complete

    // Second call must be served from cache
    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cacheHit).toBe(true);
  });
});

// ─── GET /checkin/stats/:eventId — detailed data assertions ──────────────────

describe('GET /api/v1/checkin/stats/:eventId — detailed data assertions', () => {
  beforeEach(async () => {
    await redis.del(`checkin_stats:${eventId}`);
  });

  it('checkInRate is a percentage value (0–100), not a fractional decimal', async () => {
    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    const { checkInRate, checkedIn, totalTickets } = res.body.data as {
      checkInRate: number;
      checkedIn: number;
      totalTickets: number;
    };

    expect(checkInRate).toBeGreaterThanOrEqual(0);
    expect(checkInRate).toBeLessThanOrEqual(100);
    if (totalTickets > 0) {
      // Verifies formula is (checkedIn / totalTickets) * 100, not a bare fraction
      expect(checkInRate).toBeCloseTo((checkedIn / totalTickets) * 100, 5);
    }
  });

  it('recentScans are ordered by scannedAt DESC (most recent scan appears first)', async () => {
    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    const scans = res.body.data.recentScans as Array<{ scannedAt: string }>;
    // Requires at least one previous test to have created a log — there are several
    expect(scans.length).toBeGreaterThan(0);

    for (let i = 0; i < scans.length - 1; i++) {
      expect(new Date(scans[i].scannedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(scans[i + 1].scannedAt).getTime(),
      );
    }
  });

  it('recentScans never exceeds 10 entries even when the event has more than 10 logs', async () => {
    const anchor = await seedTicket('ACTIVE');

    // Insert 12 CheckInLog rows directly — faster than 12 HTTP round-trips
    await prisma.checkInLog.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        ticketId:    anchor.id,
        staffUserId: staffUserId,
        result:      'VALID',
        scannedAt:   new Date(Date.now() - (11 - i) * 1_000), // ascending timestamps
      })),
    });

    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.body.data.recentScans).toHaveLength(10);

    // Cleanup seeded data
    await prisma.checkInLog.deleteMany({ where: { ticketId: anchor.id } });
    await redis.del(`qr:${anchor.qrToken}`);
  });

  it('errorCount is 0 when all CheckInLog entries for the event have result VALID', async () => {
    // The service only persists CheckInLog rows for VALID outcomes.
    // INVALID_TOKEN / ALREADY_USED / etc. are returned to the client but never written to the DB.
    // Therefore errorCount (count of non-VALID logs) must be 0 at this point in the suite.
    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.errorCount).toBe(0);
  });

  it('errorCount is correct when non-VALID CheckInLog entries exist', async () => {
    const anchor = await seedTicket('ACTIVE');

    // Insert 2 non-VALID log entries directly (the service itself never persists these result codes)
    await prisma.checkInLog.createMany({
      data: [
        {
          ticketId:    anchor.id,
          staffUserId: staffUserId,
          result:      'INVALID_TOKEN',
          scannedAt:   new Date(),
        },
        {
          ticketId:    anchor.id,
          staffUserId: staffUserId,
          result:      'ALREADY_USED',
          scannedAt:   new Date(),
        },
      ],
    });

    const res = await request(app)
      .get(`${BASE}/stats/${eventId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    // errorCount must include both non-VALID rows we just inserted
    expect(res.body.data.errorCount).toBeGreaterThanOrEqual(2);

    // Cleanup
    await prisma.checkInLog.deleteMany({ where: { ticketId: anchor.id } });
    await redis.del(`qr:${anchor.qrToken}`);
  });
});
