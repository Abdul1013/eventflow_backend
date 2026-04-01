import { z } from 'zod';

export const purchaseTicketSchema = z.object({
  eventId: z.string().uuid(),
  ticketTypeId: z.string().uuid(),
  preferences: z
    .object({
      groupSize: z.number().int().min(1).max(20).optional(),
      needsAccessible: z.boolean().optional(),
    })
    .optional(),
});

export const cancelTicketSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const listTicketsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['ACTIVE', 'USED', 'CANCELLED', 'TRANSFERRED']).optional(),
  eventId: z.string().uuid().optional(),
});

export const ticketIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const transferTicketSchema = z.object({
  toEmail: z.string().email(),
});

export type PurchaseTicketDto = z.infer<typeof purchaseTicketSchema>;
export type CancelTicketDto = z.infer<typeof cancelTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsSchema>;
export type TransferTicketDto = z.infer<typeof transferTicketSchema>;
