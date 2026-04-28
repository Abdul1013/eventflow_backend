import { prisma } from '../../config/database.js';
import { Errors } from '../../lib/errors.js';
import { generateQrToken, generateQrDataUrl } from '../../lib/qr.js';
import { redisSet, redisDel, redisGet } from '../../config/redis.js';
import { sendTicketEmail } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import type { PurchaseTicketDto, ListTicketsQuery, TransferTicketDto } from './tickets.dto.js';
import type { TicketStatus } from '@prisma/client';


const ticketInclude = {
  event: {
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      bannerUrl: true,
      venue: { select: { name: true, address: true } },
    },
  },
  ticketType: { select: { name: true, price: true } },
  seat: { select: { rowLabel: true, seatNumber: true, section: true } },
} as const;

// Date / seat formatting helpers 

function formatEventDate(startsAt: Date, endsAt: Date): string {
  const tz = 'Africa/Lagos';
  const datePart = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz,
  }).format(startsAt);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz,
    }).format(d);
  return `${datePart} · ${fmt(startsAt)} – ${fmt(endsAt)}`;
}

function formatSeatInfo(
  seat: { rowLabel: string; seatNumber: string; section?: string | null } | null | undefined,
): string {
  if (!seat) return 'Seat TBA';
  const base = `Row ${seat.rowLabel}, Seat ${seat.seatNumber}`;
  return seat.section ? `${base} — ${seat.section}` : base;
}

// getMyTickets 

export const getMyTickets = async (userId: string, query: ListTicketsQuery) => {
  const { page, limit, status, eventId } = query;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    deletedAt: null,
    ...(status ? { status: status as TicketStatus } : {}),
    ...(eventId ? { eventId } : {}),
  };

  const [rawTickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: { issuedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  // Strip qrToken — never expose it in list responses
  const tickets = rawTickets.map(({ qrToken: _qr, ...rest }) => rest);

  return { tickets, total, page, limit };
};

// getTicketById 

export const getTicketById = async (ticketId: string, userId: string, isAdmin = false) => {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, deletedAt: null },
    include: ticketInclude,
  });

  if (!ticket) throw Errors.notFound('Ticket');
  // Non-admin accessing another user's ticket → 403 (never leak existence via 404)
  if (!isAdmin && ticket.userId !== userId) throw Errors.forbidden();

  const qrDataUrl = await generateQrDataUrl(ticket.qrToken);
  return { ...ticket, qrDataUrl };
};

// purchaseTicket 

export const purchaseTicket = async (userId: string, dto: PurchaseTicketDto) => {
  const ticketId = crypto.randomUUID();
  const qrToken = generateQrToken(ticketId);

  const ticketWithUser = await prisma.$transaction(
    async (tx) => {
      const ticketType = await tx.ticketType.findFirst({
        where: { id: dto.ticketTypeId, eventId: dto.eventId },
        include: { event: { select: { status: true } } },
      });

      if (!ticketType) throw Errors.notFound('Ticket type');

      const { status } = ticketType.event;
      if (status !== 'PUBLISHED' && status !== 'ONGOING') {
        throw Errors.conflict('Event is not currently accepting ticket purchases');
      }

      // Atomic availability check — prevents overselling under concurrent load
      const inc = await tx.ticketType.updateMany({
        where: { id: dto.ticketTypeId, quantitySold: { lt: ticketType.quantityTotal } },
        data: { quantitySold: { increment: 1 } },
      });

      if (inc.count === 0) throw Errors.noSeatsAvailable();

      return tx.ticket.create({
        data: { id: ticketId, userId, eventId: dto.eventId, ticketTypeId: dto.ticketTypeId, qrToken, status: 'ACTIVE' },
        // Include user for fire-and-forget email (no extra query needed)
        include: { ...ticketInclude, user: { select: { email: true, name: true } } },
      });
    },
    { timeout: 10_000 },
  );

  // Separate user from ticket data — user is not exposed in the API response
  const { user: ticketUser, ...ticket } = ticketWithUser;

  // Cache QR token → ticketId for check-in (fire-and-forget)
  void redisSet(`qr:${qrToken}`, 86_400, ticketId);

  // Send confirmation email with QR code (fire-and-forget, never blocks response)
  void (async () => {
    try {
      const qrDataUrl = await generateQrDataUrl(qrToken);
      const eventDate = formatEventDate(ticket.event.startsAt, ticket.event.endsAt);
      const seatInfo = formatSeatInfo(ticket.seat);
      await sendTicketEmail(
        ticketUser.email,
        ticketUser.name,
        ticket.event.title,
        eventDate,
        ticket.event.venue.name,
        seatInfo,
        ticket.ticketType.name,
        qrDataUrl,
      );
    } catch (err) {
      logger.error({ err }, '[tickets] Failed to send ticket email');
    }
  })();

  return ticket;
};

// cancelTicket 

export const cancelTicket = async (ticketId: string, userId: string) => {
  // Fetch without deletedAt filter so we give an accurate 409 on double-cancel
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, userId } });

  if (!ticket) throw Errors.notFound('Ticket');
  if (ticket.status !== 'ACTIVE') {
    throw Errors.conflict('Only active tickets can be cancelled');
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: 'CANCELLED', deletedAt: new Date() },
    });
    await tx.ticketType.update({
      where: { id: ticket.ticketTypeId },
      data: { quantitySold: { decrement: 1 } },
    });
  });

  void redisDel(`qr:${ticket.qrToken}`);
};

// transferTicket 

export const transferTicket = async (ticketId: string, fromUserId: string, dto: TransferTicketDto) => {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, deletedAt: null },
    include: ticketInclude,
  });

  if (!ticket) throw Errors.notFound('Ticket');
  if (ticket.userId !== fromUserId) throw Errors.forbidden();
  if (ticket.status !== 'ACTIVE') throw Errors.ticketNotTransferable();

  const targetUser = await prisma.user.findUnique({
    where: { email: dto.toEmail },
    select: { id: true, email: true, name: true },
  });
  if (!targetUser) throw Errors.transferTargetNotFound();

  // Guard: target must not already have an active ticket for this event
  const existing = await prisma.ticket.findFirst({
    where: { userId: targetUser.id, eventId: ticket.eventId, status: 'ACTIVE', deletedAt: null },
  });
  if (existing) throw Errors.transferTargetHasTicket();

  const newQrToken = generateQrToken(ticketId);

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { userId: targetUser.id, qrToken: newQrToken, status: 'ACTIVE' },
    include: ticketInclude,
  });

  // Redis swap: revoke old token, register new token (fire-and-forget)
  void Promise.all([
    redisDel(`qr:${ticket.qrToken}`),
    redisSet(`qr:${newQrToken}`, 86_400, ticketId),
  ]);

  // Fire-and-forget: send ticket email to new owner
  void (async () => {
    try {
      const qrDataUrl = await generateQrDataUrl(newQrToken);
      const eventDate = formatEventDate(updated.event.startsAt, updated.event.endsAt);
      const seatInfo = formatSeatInfo(updated.seat);
      await sendTicketEmail(
        targetUser.email,
        targetUser.name,
        updated.event.title,
        eventDate,
        updated.event.venue.name,
        seatInfo,
        updated.ticketType.name,
        qrDataUrl,
      );
    } catch (err) {
      logger.error({ err }, '[tickets] Failed to send transfer email');
    }
  })();

  return { ticket: updated, previousOwnerId: fromUserId, newOwner: targetUser };
};

// Re-export for test introspection of Redis state
export { redisGet };
