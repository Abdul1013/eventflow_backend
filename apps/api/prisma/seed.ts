/**
 * Production-safe seed script.
 * Each section is guarded — safe to run on production after migration.
 * Does nothing if the target records already exist.
 *
 * Creates:
 *   1. ADMIN user: admin@eventflow.app / SEED_ADMIN_PASSWORD env var
 *      (defaults to 'EventFlow2026!' — warns loudly if using default in production)
 *   2. Sample venue: "LCU Main Auditorium", Ibadan, 500 seats
 *      (rows A–J, 50 seats each, 40 px horizontal / 50 px vertical spacing)
 *   3. Sample PUBLISHED event: "EventFlow Demo Event"
 *      with two ticket types: VIP (₦5,000, 50 seats) and Regular (₦2,000, 450 seats)
 */

import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = 50;
const SEAT_SPACING_X = 40;
const SEAT_SPACING_Y = 50;

async function seedAdmin(): Promise<string> {
  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (existingAdmin) {
    console.log(`[seed] Admin already exists: ${existingAdmin.email} — skipping`);
    return existingAdmin.id;
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? 'EventFlow2026!';
  if (!process.env.SEED_ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
    console.warn(
      '[seed] WARNING: SEED_ADMIN_PASSWORD not set — using default password in production! ' +
      'Set SEED_ADMIN_PASSWORD in your environment before deploying.',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      name: 'EventFlow Admin',
      email: 'admin@eventflow.app',
      passwordHash,
      role: 'ADMIN',
      emailVerified: true,
    },
  });

  console.log(`[seed] Created admin: ${admin.email}`);
  return admin.id;
}

async function seedVenue(): Promise<string> {
  const existingVenue = await prisma.venue.findFirst({
    where: { name: 'LCU Main Auditorium' },
  });
  if (existingVenue) {
    console.log('[seed] Venue already exists — skipping');
    return existingVenue.id;
  }

  const totalCapacity = ROWS.length * SEATS_PER_ROW; // 500

  const venue = await prisma.venue.create({
    data: {
      name: 'LCU Main Auditorium',
      address: 'Lead City University, Toll Gate Area',
      city: 'Ibadan',
      totalCapacity,
      layoutJson: {
        sections: [
          {
            name: 'Main Floor',
            rows: ROWS.length,
            seatsPerRow: SEATS_PER_ROW,
            spacingX: SEAT_SPACING_X,
            spacingY: SEAT_SPACING_Y,
          },
        ],
      },
      seats: {
        create: ROWS.flatMap((rowLabel, rowIndex) =>
          Array.from({ length: SEATS_PER_ROW }, (_, seatIndex) => ({
            rowLabel,
            seatNumber: String(seatIndex + 1),
            section: 'Main Floor',
            xCoord: (seatIndex + 1) * SEAT_SPACING_X,
            yCoord: (rowIndex + 1) * SEAT_SPACING_Y,
            isAccessible: rowLabel === 'A' && (seatIndex === 0 || seatIndex === SEATS_PER_ROW - 1),
          })),
        ),
      },
    },
  });

  console.log(`[seed] Created venue: ${venue.name} (${totalCapacity} seats)`);
  return venue.id;
}

async function seedEvent(organizerId: string, venueId: string): Promise<void> {
  const existingEvent = await prisma.event.findFirst({
    where: { title: 'EventFlow Demo Event' },
  });
  if (existingEvent) {
    console.log('[seed] Demo event already exists — skipping');
    return;
  }

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(14, 0, 0, 0); // tomorrow at 2 PM

  const endsAt = new Date(startsAt);
  endsAt.setHours(20, 0, 0, 0); // same day at 8 PM

  const event = await prisma.event.create({
    data: {
      title: 'EventFlow Demo Event',
      description:
        'A demonstration event showcasing the full EventFlow ticket management system. ' +
        'This event is used for academic validation of the hybrid seat allocation engine.',
      organizerId,
      venueId,
      startsAt,
      endsAt,
      status: 'PUBLISHED',
      ticketTypes: {
        create: [
          {
            name: 'VIP',
            price: 5000,
            quantityTotal: 50,
            description: 'Premium seating in rows A–B with priority entry',
          },
          {
            name: 'Regular',
            price: 2000,
            quantityTotal: 450,
            description: 'Standard seating in rows C–J',
          },
        ],
      },
    },
  });

  console.log(`[seed] Created event: "${event.title}" (status: ${event.status})`);
  console.log('[seed] Ticket types: VIP × 50 (₦5,000), Regular × 450 (₦2,000)');
}

async function main(): Promise<void> {
  console.log('[seed] Starting production-safe seed...');

  const adminId = await seedAdmin();
  const venueId = await seedVenue();
  await seedEvent(adminId, venueId);

  console.log('[seed] Done.');
}

main()
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
