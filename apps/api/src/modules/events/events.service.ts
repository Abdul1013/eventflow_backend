import type { Prisma, EventStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { Errors } from '../../lib/errors.js';
import type { CreateEventDto, UpdateEventDto, ListEventsQuery } from './events.dto.js';

// ─── Status transition table ──────────────────────────────────────────────────

const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT:     ['PUBLISHED'],
  PUBLISHED: ['ONGOING', 'CANCELLED'],
  ONGOING:   ['ENDED', 'CANCELLED'],
  ENDED:     [],
  CANCELLED: [],
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listEvents = async (query: ListEventsQuery, isAdmin = false) => {
  const { page, limit, search, status, sort, venueId } = query;
  const skip = (page - 1) * limit;

  // Non-admins always see only PUBLISHED events, regardless of query param
  const effectiveStatus: EventStatus | undefined = isAdmin ? status : 'PUBLISHED';

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

// ─── Mutations ────────────────────────────────────────────────────────────────

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

  // Strip undefined values — Prisma with exactOptionalPropertyTypes rejects them
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
