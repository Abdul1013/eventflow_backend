import { z } from 'zod';

// ─── Seat / Row layout schemas ─────────────────────────────────────────────────

const seatInRowSchema = z.object({
  number: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  accessible: z.boolean().default(false),
});

const rowSchema = z.object({
  label: z.string().min(1),
  seats: z.array(seatInRowSchema).min(1),
});

// ─── Request schemas ───────────────────────────────────────────────────────────

export const createVenueSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(5),
  city: z.string().min(2),
  totalCapacity: z.number().int().positive(),
  layoutJson: z.object({
    rows: z.array(rowSchema).min(1),
  }),
});

export const updateVenueSchema = createVenueSchema.pick({
  name: true,
  address: true,
  city: true,
});

export const venueIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── DTO types ─────────────────────────────────────────────────────────────────

export type CreateVenueDto = z.infer<typeof createVenueSchema>;
export type UpdateVenueDto = z.infer<typeof updateVenueSchema>;
