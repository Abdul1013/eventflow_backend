import { z } from 'zod';

export const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'STAFF', 'ATTENDEE']),
});

export const adminUserIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const adminEventIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
