import { z } from 'zod';

const createEventBase = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  venueId: z.string().trim().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  bannerUrl: z.string().url().optional(),
  ticketTypes: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.number().nonnegative(),
        quantityTotal: z.number().int().positive(),
        description: z.string().optional(),
      }),
    )
    .min(1),
});

export const createEventSchema = createEventBase
  .refine((d) => d.endsAt > d.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })
  .refine((d) => d.startsAt > new Date(), {
    message: 'startsAt must be in the future',
    path: ['startsAt'],
  });

export const updateEventSchema = createEventBase.partial().omit({ ticketTypes: true });

export const eventStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'CANCELLED']),
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ONGOING', 'ENDED', 'CANCELLED']).optional(),
  sort: z.enum(['startsAt', 'createdAt', 'title']).default('startsAt'),
  venueId: z.string().uuid().optional(),
});

export const eventIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateEventDto = z.infer<typeof createEventSchema>;
export type UpdateEventDto = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
