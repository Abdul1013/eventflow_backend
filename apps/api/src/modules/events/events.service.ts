import type { Prisma, EventStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { Errors } from '../../lib/errors.js';
import { uploadEventBanner } from '../../lib/upload.js';
import { saoClient, type SaoSeat, type SaoAttendee } from '../../lib/saoClient.js';
import type { CreateEventDto, UpdateEventDto, ListEventsQuery } from './events.dto.js';

// ─── Status transition table ─

const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT:     ['PUBLISHED'],
  PUBLISHED: ['ONGOING', 'CANCELLED'],
  ONGOING:   ['ENDED', 'CANCELLED'],
  ENDED:     [],
  CANCELLED: [],
};

// ─── Queries 

export const listEvents = async (query: ListEventsQuery, isPrivileged = false) => {
  const { page, limit, search, status, sort, venueId } = query;
  const skip = (page - 1) * limit;

  // Privileged callers (ADMIN/STAFF) can filter freely; attendees only see PUBLISHED.
  const effectiveStatus: EventStatus | undefined = isPrivileged ? status : 'PUBLISHED';

  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    ...(effectiveStatus ? { status: effectiveStatus } : {}),
    ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(venueId ? { venueId } : {}),
  };

  const orderBy: Prisma.EventOrderByWithRelationInput =
    sort === 'title'
      ? { title: 'asc' }
      : sort === 'createdAt'
      ? { createdAt: 'desc' }
      : { startsAt: 'asc' };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        title: true,
        description: true,
        startsAt: true,
        endsAt: true,
        status: true,
        bannerUrl: true,
        venue: { select: { id: true, name: true, city: true } },
        ticketTypes: { select: { quantityTotal: true, quantitySold: true } },
      },
    }),
    prisma.event.count({ where }),
  ]);

  return { events, total, page, limit };
};

export const getEventById = async (id: string) => {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    include: {
      venue: true,
      ticketTypes: true,
      organizer: { select: { id: true, name: true } },
    },
  });
  if (!event) throw Errors.notFound('Event');
  return event;
};

// ─── Mutations 

export const createEvent = async (organizerId: string, dto: CreateEventDto) => {
  const { ticketTypes, ...eventData } = dto;
  return prisma.$transaction(async (tx) => {
    const venue = await tx.venue.findUnique({ where: { id: eventData.venueId } });
    if (!venue) throw Errors.notFound('Venue');

    return tx.event.create({
      data: {
        title: eventData.title,
        description: eventData.description,
        venueId: eventData.venueId,
        organizerId,
        startsAt: eventData.startsAt,
        endsAt: eventData.endsAt,
        bannerUrl: eventData.bannerUrl ?? null,
        ticketTypes: {
          create: ticketTypes.map((tt) => ({
            name: tt.name,
            price: tt.price,
            quantityTotal: tt.quantityTotal,
            description: tt.description ?? null,
          })),
        },
      },
      include: { ticketTypes: true, venue: { select: { id: true, name: true, city: true } } },
    });
  });
};

export const updateEvent = async (id: string, dto: UpdateEventDto) => {
  const event = await prisma.event.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');
  if (event.status !== 'DRAFT') throw Errors.eventNotEditable();

  const data = Object.fromEntries(
    Object.entries(dto)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v === undefined ? null : v]),
  );

  return prisma.event.update({
    where: { id },
    data,
    include: { ticketTypes: true, venue: { select: { id: true, name: true, city: true } } },
  });
};

export const updateEventStatus = async (id: string, newStatus: EventStatus) => {
  const event = await prisma.event.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');

  const allowed = TRANSITIONS[event.status];
  if (!allowed.includes(newStatus)) {
    throw Errors.invalidStatusTransition(event.status, newStatus);
  }

  return prisma.event.update({ where: { id }, data: { status: newStatus } });
};

export const softDeleteEvent = async (id: string) => {
  const event = await prisma.event.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');
  if (event.status !== 'DRAFT' && event.status !== 'CANCELLED') {
    throw Errors.eventNotDeletable();
  }
  return prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
};

export const uploadBanner = async (id: string, fileBuffer: Buffer): Promise<string> => {
  const event = await prisma.event.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');
  const bannerUrl = await uploadEventBanner(fileBuffer);
  await prisma.event.update({ where: { id }, data: { bannerUrl } });
  return bannerUrl;
};

// ─── Seat map 

type SeatStatus = 'AVAILABLE' | 'ALLOCATED' | 'CHECKED_IN';

export const getEventSeats = async (eventId: string) => {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    include: { venue: { include: { seats: true } } },
  });
  if (!event) throw Errors.notFound('Event');

  // Fetch all ACTIVE + USED tickets that have a seat assigned
  const tickets = await prisma.ticket.findMany({
    where: { eventId, status: { in: ['ACTIVE', 'USED'] }, seatId: { not: null }, deletedAt: null },
    select: { seatId: true, status: true },
  });

  // Build seatId → SeatStatus lookup
  const seatStatusMap = new Map<string, SeatStatus>();
  for (const t of tickets) {
    if (t.seatId) {
      seatStatusMap.set(t.seatId, t.status === 'USED' ? 'CHECKED_IN' : 'ALLOCATED');
    }
  }

  return {
    eventId,
    seats: event.venue.seats.map((s) => ({
      id:           s.id,
      rowLabel:     s.rowLabel,
      seatNumber:   s.seatNumber,
      section:      s.section,
      xCoord:       s.xCoord,
      yCoord:       s.yCoord,
      isAccessible: s.isAccessible,
      status:       (seatStatusMap.get(s.id) ?? 'AVAILABLE') as SeatStatus,
    })),
  };
};

// ─── SAO allocation 

export const getAllocations = async (eventId: string) => {
  const event = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw Errors.notFound('Event');

  const allocations = await prisma.allocation.findMany({
    where: { eventId },
    orderBy: { runAt: 'desc' },
  });

  return allocations.map((a) => ({
    id:             a.id,
    algorithmUsed:  a.algorithmUsed,
    utilizationRate: a.utilizationRate,
    runAt:          a.runAt,
    seatsAssigned:  Array.isArray(a.seatMapJson) ? (a.seatMapJson as unknown[]).length : 0,
    seatMapJson:    a.seatMapJson,
  }));
};

export const runAllocationComparison = async (eventId: string) => {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    include: {
      venue: { include: { seats: true } },
      tickets: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, userId: true },
      },
    },
  });

  if (!event) throw Errors.notFound('Event');
  if (event.status !== 'PUBLISHED' && event.status !== 'ONGOING') {
    throw Errors.eventNotAllocatable();
  }

  const seats: SaoSeat[] = event.venue.seats.map((s) => ({
    id:           s.id,
    rowLabel:     s.rowLabel,
    seatNumber:   s.seatNumber,
    section:      s.section ?? null,
    xCoord:       s.xCoord,
    yCoord:       s.yCoord,
    isAccessible: s.isAccessible,
  }));

  const attendees: SaoAttendee[] = event.tickets.map((t) => ({
    userId:          t.userId,
    ticketId:        t.id,
    groupSize:       1,
    needsAccessible: false,
  }));

  const comparison = await saoClient.compare({ eventId, seats, attendees });

  // Store one Allocation audit record per algorithm so history is preserved
  await prisma.$transaction([
    prisma.allocation.create({
      data: {
        eventId,
        algorithmUsed:  'kmeans_greedy',
        utilizationRate: comparison.saoUtilizationRate,
        seatMapJson:    [] as unknown as Prisma.InputJsonArray,
      },
    }),
    prisma.allocation.create({
      data: {
        eventId,
        algorithmUsed:  'manual_baseline',
        utilizationRate: comparison.baselineUtilizationRate,
        seatMapJson:    [] as unknown as Prisma.InputJsonArray,
      },
    }),
  ]);

  return { ...comparison, eventTitle: event.title };
};

export const runAllocation = async (eventId: string) => {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    include: {
      venue: { include: { seats: true } },
      tickets: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, userId: true },
      },
    },
  });

  if (!event) throw Errors.notFound('Event');
  if (event.status !== 'PUBLISHED' && event.status !== 'ONGOING') {
    throw Errors.eventNotAllocatable();
  }

  const seats: SaoSeat[] = event.venue.seats.map((s) => ({
    id: s.id,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    section: s.section ?? null,
    xCoord: s.xCoord,
    yCoord: s.yCoord,
    isAccessible: s.isAccessible,
  }));

  const attendees: SaoAttendee[] = event.tickets.map((t) => ({
    userId: t.userId,
    ticketId: t.id,
    groupSize: 1,
    needsAccessible: false,
  }));

  const result = await saoClient.run({ eventId, seats, attendees });

  // Persist seat assignments + create Allocation audit record in one transaction
  await prisma.$transaction([
    ...result.assignments.map((a) =>
      prisma.ticket.update({
        where: { id: a.ticketId },
        data: { seatId: a.seatId },
      }),
    ),
    prisma.allocation.create({
      data: {
        eventId,
        algorithmUsed: result.algorithmUsed,
        utilizationRate: result.utilizationRate,
        seatMapJson: JSON.parse(JSON.stringify(result.assignments)) as Prisma.InputJsonArray,
      },
    }),
  ]);

  return result;
};
