import { z } from 'zod';

export const scanTicketSchema = z.object({
  token: z.string().min(1).max(500),
  deviceInfo: z.string().optional(),
});

export const manualCheckinSchema = z.object({
  ticketId: z.string().uuid(),
});

export const statsParamSchema = z.object({
  eventId: z.string().uuid(),
});

export type ScanTicketDto = z.infer<typeof scanTicketSchema>;
export type ManualCheckinDto = z.infer<typeof manualCheckinSchema>;
