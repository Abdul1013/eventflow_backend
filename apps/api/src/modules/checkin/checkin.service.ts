import { prisma } from '../../config/database.js';
import { redis, redisDel } from '../../config/redis.js';
import { verifyQrToken } from '../../lib/qr.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

// Types

type ScanResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID_TOKEN'
  | 'EVENT_NOT_ACTIVE'
  | 'TICKET_CANCELLED';

interface CheckInOutcome {
  result: ScanResult;
  message: string;
  attendeeName?: string;
  seatInfo?: string;
  ticketType?: string;
  eventTitle?: string;
}

// ─── Lua script: atomic GET + DEL ─────────────────────────────────────────────
// Redis Lua scripts execute atomically — no other command can interleave between
// the GET and DEL, preventing the race condition where two staff devices scan the
// same token simultaneously. Only one caller will ever receive the ticketId back.

const LUA_GET_DEL = `
local val = redis.call('GET', KEYS[1])
if val then redis.call('DEL', KEYS[1]) end
return val
`;

// ─── Ticket include shape 

const checkinTicketInclude = {
  user: { select: { name: true } },
  seat: true,
  ticketType: { select: { name: true } },
  event: { select: { id: true, title: true, status: true } },
} as const;

// ─── Cache helpers ────────────────────────────────────────────────────────────

const STATS_TTL_SECONDS = 25; // slightly under the 30 s client poll interval

function statsCacheKey(eventId: string): string {
  return `checkin_stats:${eventId}`;
}

//  Seat formatting 
function formatSeat(
  seat: { rowLabel: string; seatNumber: string; section?: string | null } | null,
): string {
  if (!seat) return 'Seat TBA';
  const base = `Row ${seat.rowLabel}, Seat ${seat.seatNumber}`;
  return seat.section ? `${base} — ${seat.section}` : base;
}

//  scanTicket 
export const scanTicket = async (
  token: string,
  staffUserId: string,
  deviceInfo?: string,
): Promise<CheckInOutcome> => {
  const key = `qr:${token}`;

  // Step 1 — Redis existence check (O(1), < 5ms target).
  // A null here means the token was never issued or has expired — INVALID_TOKEN.
  const initialCheck = await redis.get(key);
  if (initialCheck === null) {
    logger.warn('[checkin] scan attempt with unknown/expired token');
    return { result: 'INVALID_TOKEN', message: 'QR code is invalid or expired' };
  }

  // Step 2 — Atomic GET + DEL via Lua.
  // If another scanner consumed the token between step 1 and now, the Lua script
  // returns null and we report ALREADY_USED instead of INVALID_TOKEN.
  const ticketId = (await redis.eval(LUA_GET_DEL, 1, key)) as string | null;
  if (ticketId === null) {
    return { result: 'ALREADY_USED', message: 'This ticket has already been checked in' };
  }

  // Step 3 — HMAC verification.
  // Confirms the token was issued by this server and was not forged out-of-band.
  try {
    verifyQrToken(token);
  } catch {
    return { result: 'INVALID_TOKEN', message: 'QR code failed security verification' };
  }

  // Step 4 — DB lookup for ticket state and response payload.
  // This read happens AFTER the token has been atomically consumed so the critical
  // path (Redis → HMAC → DB read → response) is still sub-200ms under normal load.
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: checkinTicketInclude,
  });

  if (!ticket) {
    // Redis and DB are out of sync — log as CRITICAL for ops investigation.
    logger.error(
      { ticketId },
      `[checkin] CRITICAL: token pointed to unknown ticketId=${ticketId}. Redis/DB inconsistency.`,
    );
    return { result: 'INVALID_TOKEN', message: 'Ticket record not found' };
  }

  // Guard: event must be accepting check-ins.
  if (!['PUBLISHED', 'ONGOING'].includes(ticket.event.status)) {
    // Restore the token — the ticket is still valid, the event just isn't open yet.
    void redis.setex(key, 86_400, ticketId);
    return { result: 'EVENT_NOT_ACTIVE', message: 'Check-in is not open for this event' };
  }

  // Guard: ticket must not already be USED (DB/Redis consistency edge case).
  if (ticket.status === 'USED') {
    logger.warn(
      { ticketId },
      `[checkin] WARNING: ticket ${ticketId} is USED in DB but Redis still held its token`,
    );
    return { result: 'ALREADY_USED', message: 'This ticket has already been checked in' };
  }

  // Guard: cancelled ticket — restore token so re-scanning gives a clear message.
  if (ticket.status === 'CANCELLED') {
    void redis.setex(key, 86_400, ticketId);
    return { result: 'TICKET_CANCELLED', message: 'This ticket has been cancelled' };
  }

  // Step 4 (cont.) — Fire-and-forget DB write + cache invalidation.
  // The response is sent immediately; the DB write runs concurrently.
  // This is intentional — H2 hypothesis requires < 200ms scan response time.
  // The stats cache is invalidated alongside the DB write so the next 30 s
  // poll always reflects the updated checked-in count.
  const eventId = ticket.event.id;
  void (async () => {
    try {
      await Promise.all([
        prisma.ticket.update({
          where: { id: ticketId },
          data: { status: 'USED', checkInAt: new Date() },
        }),
        prisma.checkInLog.create({
          data: {
            ticketId,
            staffUserId,
            result: 'VALID',
            deviceInfo: deviceInfo ?? null,
            scannedAt: new Date(),
          },
        }),
        redis.del(statsCacheKey(eventId)),
      ]);
    } catch (err) {
      logger.error({ err }, '[checkin] Failed to persist check-in to DB');
    }
  })();

  // Step 5 — Return success immediately (DB write is in flight).
  return {
    result: 'VALID',
    message: 'Check-in successful',
    attendeeName: ticket.user.name,
    seatInfo: formatSeat(ticket.seat),
    ticketType: ticket.ticketType.name,
    eventTitle: ticket.event.title,
  };
};

//  manualCheckin 
export const manualCheckin = async (
  ticketId: string,
  adminUserId: string,
): Promise<CheckInOutcome> => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: checkinTicketInclude,
  });

  if (!ticket) throw Errors.notFound('Ticket');
  if (ticket.status !== 'ACTIVE') throw Errors.ticketNotActive();

  if (!['PUBLISHED', 'ONGOING'].includes(ticket.event.status)) {
    throw Errors.conflict('Event is not currently accepting check-ins');
  }

  // Synchronous write — admin override, latency is acceptable.
  await Promise.all([
    prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'USED', checkInAt: new Date() },
    }),
    prisma.checkInLog.create({
      data: {
        ticketId,
        staffUserId: adminUserId,
        result: 'VALID',
        scannedAt: new Date(),
      },
    }),
  ]);

  // Invalidate the QR token in Redis synchronously before returning — eliminates the
  // race window where a scanner could consume the token after we've marked it USED.
  await redisDel(`qr:${ticket.qrToken}`);

  return {
    result: 'VALID',
    message: 'Manual check-in successful',
    attendeeName: ticket.user.name,
    seatInfo: formatSeat(ticket.seat),
    ticketType: ticket.ticketType.name,
    eventTitle: ticket.event.title,
  };
};

//   getCheckinStats
export const getCheckinStats = async (eventId: string) => {
  const cacheKey = statsCacheKey(eventId);

  // ── Cache read ───────────────────────────────────────────────────────────
  // TTL is 25 s — slightly less than the 30 s client poll interval so the
  // next poll always fetches data that is at most ~25 s old.
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    try {
      const payload = JSON.parse(cached) as Record<string, unknown>;
      return { ...payload, cacheHit: true };
    } catch {
      // Corrupted entry — fall through to a fresh DB read.
    }
  }

  // ── Cache miss: query DB ─────────────────────────────────────────────────
  const [totalTickets, checkedIn, recentScans, errorCount] = await Promise.all([
    // Only count tickets that are ACTIVE or USED — exclude CANCELLED / TRANSFERRED
    prisma.ticket.count({
      where: { eventId, status: { in: ['ACTIVE', 'USED'] }, deletedAt: null },
    }),
    prisma.ticket.count({
      where: { eventId, status: 'USED' },
    }),
    prisma.checkInLog.findMany({
      where: { ticket: { eventId } },
      orderBy: { scannedAt: 'desc' },
      take: 10,
      include: {
        ticket: { include: { user: { select: { name: true } } } },
      },
    }),
    prisma.checkInLog.count({
      where: { ticket: { eventId }, result: { not: 'VALID' } },
    }),
  ]);

  const remaining   = totalTickets - checkedIn;
  const checkInRate = totalTickets > 0 ? (checkedIn / totalTickets) * 100 : 0;

  const payload = {
    totalTickets,
    checkedIn,
    remaining,
    checkInRate,
    errorCount,
    recentScans: recentScans.map((log) => ({
      id:           log.id,
      scannedAt:    log.scannedAt,
      result:       log.result,
      attendeeName: log.ticket.user.name,
    })),
  };

  // ── Cache write (fire-and-forget — non-critical path) ────────────────────
  void redis.setex(cacheKey, STATS_TTL_SECONDS, JSON.stringify(payload));

  return { ...payload, cacheHit: false };
};
