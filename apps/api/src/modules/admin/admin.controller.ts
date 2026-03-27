import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import { Errors } from '../../lib/errors.js';
import { z } from 'zod';
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
import * as adminService from './admin.service.js';
import * as ticketsService from '../tickets/tickets.service.js';
import { updateRoleSchema, adminUserIdParamSchema, adminEventIdParamSchema } from './admin.dto.js';

export const listUsers: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = paginationSchema.parse(req.query);
  const { users, total } = await adminService.listUsers(page, limit);
  sendSuccess(res, users, 200, { page, total, limit });
});

export const updateUserRole: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = adminUserIdParamSchema.parse(req.params);
  // Prevent an admin from demoting their own account
  if (req.user!.sub === id) {
    throw Errors.cannotDemoteSelf();
  }
  const dto = updateRoleSchema.parse(req.body);
  const user = await adminService.updateUserRole(id, dto);
  sendSuccess(res, user);
});

export const getStats: RequestHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await adminService.getStats());
});

export const getEventAnalytics: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = adminEventIdParamSchema.parse(req.params);
  const analytics = await adminService.getEventAnalytics(id);
  sendSuccess(res, analytics);
});

export const getEventTickets: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = adminEventIdParamSchema.parse(req.params);
  const { page, limit } = paginationSchema.parse(req.query);
  const result = await adminService.getEventTickets(id, page, limit);
  sendSuccess(res, result.tickets, 200, { page: result.page, total: result.total, limit: result.limit });
});

export const getTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = adminUserIdParamSchema.parse(req.params);
  const ticket = await ticketsService.getTicketById(id, req.user!.sub, true);
  sendSuccess(res, ticket);
});
