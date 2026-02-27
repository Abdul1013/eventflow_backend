import { prisma } from '../../config/database.js';
import { Errors } from '../../lib/errors.js';
import type { CreateVenueDto, UpdateVenueDto } from './venues.dto.js';

export const listVenues = async () =>
  prisma.venue.findMany({ orderBy: { name: 'asc' } });

export const getVenueById = async (id: string) => {
  const venue = await prisma.venue.findUnique({
    where: { id },
    include: { seats: { orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }] } },
  });
  if (!venue) throw Errors.notFound('Venue');
  return venue;
};

export const createVenue = async (dto: CreateVenueDto) => {
  return prisma.$transaction(async (tx) => {
    const venue = await tx.venue.create({
      data: {
        name: dto.name,
        address: dto.address,
        city: dto.city,
        totalCapacity: dto.totalCapacity,
        layoutJson: dto.layoutJson,
      },
    });

    const seatRows = dto.layoutJson.rows.flatMap((row) =>
      row.seats.map((seat) => ({
        venueId: venue.id,
        rowLabel: row.label,
        seatNumber: seat.number,
        xCoord: seat.x,
        yCoord: seat.y,
        isAccessible: seat.accessible,
      })),
    );

    await tx.seat.createMany({ data: seatRows });

    return tx.venue.findUniqueOrThrow({
      where: { id: venue.id },
      include: { seats: { orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }] } },
    });
  });
};

export const updateVenue = async (id: string, dto: UpdateVenueDto) => {
  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) throw Errors.notFound('Venue');
  return prisma.venue.update({ where: { id }, data: dto });
};
