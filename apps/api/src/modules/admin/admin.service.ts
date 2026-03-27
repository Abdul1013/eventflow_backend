import { prisma } from '../../config/database.js';
import { Errors } from '../../lib/errors.js';
import type { UpdateRoleDto } from './admin.dto.js';
import type { Role } from '@prisma/client';

export const listUsers = async (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count(),
  ]);
  return { users, total, page, limit, pages: Math.ceil(total / limit) };
};

export const updateUserRole = async (userId: string, dto: UpdateRoleDto) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound('User');
  return prisma.user.update({
    where: { id: userId },
    data: { role: dto.role as Role },
    select: { id: true, name: true, email: true, role: true },
  });
};

export const getStats = async () => {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [totalEvents, ticketsSoldAgg, todaysCheckIns, totalUsers] = await Promise.all([
    prisma.event.count({ where: { deletedAt: null } }),
    prisma.ticketType.aggregate({ _sum: { quantitySold: true } }),
    prisma.checkInLog.count({ where: { result: 'VALID', scannedAt: { gte: todayStart } } }),
    prisma.user.count(),
  ]);

  const ticketsSold = ticketsSoldAgg._sum.quantitySold ?? 0;
  return { totalEvents, ticketsSold, todaysCheckIns, totalUsers };
};

export const getEventAnalytics = async (eventId: string) => {
  const event = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');

  const [
    salesOverTimeRaw,
    checkInOverTimeRaw,
    ticketTypeRows,
    totalSeats,
    allocatedSeats,
    soldSeats,
    checkedInSeats,
    allocationHistory,
  ] = await Promise.all([
    // Sales grouped by day
    prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT DATE("issuedAt") as date, COUNT(*) as count
      FROM "Ticket"
      WHERE "eventId" = ${eventId} AND "deletedAt" IS NULL
      GROUP BY DATE("issuedAt")
      ORDER BY date ASC
    `,
    // Check-ins grouped by hour
    prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('hour', cl."scannedAt") as hour, COUNT(*) as count
      FROM "CheckInLog" cl
      JOIN "Ticket" t ON cl."ticketId" = t.id
      WHERE t."eventId" = ${eventId} AND cl.result = 'VALID'
      GROUP BY DATE_TRUNC('hour', cl."scannedAt")
      ORDER BY hour ASC
    `,
    // Ticket type breakdown
    prisma.ticketType.findMany({
      where: { eventId },
      select: { name: true, price: true, quantityTotal: true, quantitySold: true },
    }),
    // Physical seats in the venue
    prisma.seat.count({ where: { venueId: event.venueId } }),
    // Tickets with an assigned seat (post-allocation)
    prisma.ticket.count({ where: { eventId, seatId: { not: null }, deletedAt: null } }),
    // Active + used tickets (sold)
    prisma.ticket.count({ where: { eventId, deletedAt: null, status: { in: ['ACTIVE', 'USED'] } } }),
    // Checked-in attendees
    prisma.ticket.count({ where: { eventId, status: 'USED' } }),
    // Allocation run history (latest 10)
    prisma.allocation.findMany({
      where: { eventId },
      orderBy: { runAt: 'desc' },
      select: { id: true, algorithmUsed: true, utilizationRate: true, runAt: true },
      take: 10,
    }),
  ]);

  const revenueTotal = ticketTypeRows.reduce(
    (sum, tt) => sum + parseFloat(tt.price.toString()) * tt.quantitySold,
    0,
  );

  return {
    salesOverTime: salesOverTimeRaw.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
      count: Number(r.count),
    })),
    checkInOverTime: checkInOverTimeRaw.map((r) => ({
      hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
      count: Number(r.count),
    })),
    ticketTypeBreakdown: ticketTypeRows.map((tt) => ({
      name: tt.name,
      sold: tt.quantitySold,
      total: tt.quantityTotal,
      revenue: parseFloat(tt.price.toString()) * tt.quantitySold,
    })),
    revenueTotal,
    capacityStats: { totalSeats, allocatedSeats, soldSeats, checkedInSeats },
    allocationHistory: allocationHistory.map((a) => ({
      id: a.id,
      algorithmUsed: a.algorithmUsed,
      utilizationRate: a.utilizationRate,
      runAt: a.runAt.toISOString(),
    })),
  };
};

export const getEventTickets = async (eventId: string, page: number, limit: number) => {
  const event = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');

  const skip = (page - 1) * limit;
  const where = { eventId };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        ticketType: { select: { name: true, price: true } },
        seat: { select: { rowLabel: true, seatNumber: true, section: true } },
      },
      orderBy: { issuedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets, total, page, limit, pages: Math.ceil(total / limit) };
};
