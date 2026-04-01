import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import * as ticketsService from './tickets.service.js';
import {
  purchaseTicketSchema,
  listTicketsSchema,
  ticketIdParamSchema,
  transferTicketSchema,
} from './tickets.dto.js';

export const listMyTickets: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listTicketsSchema.parse(req.query);
  const result = await ticketsService.getMyTickets(req.user!.sub, query);
  sendSuccess(res, result.tickets, 200, {
    page: result.page,
    total: result.total,
    limit: result.limit,
  });
});

export const getTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = ticketIdParamSchema.parse(req.params);
  const isAdmin = req.user?.role === 'ADMIN';
  const ticket = await ticketsService.getTicketById(id, req.user!.sub, isAdmin);
  sendSuccess(res, ticket);
});

export const purchaseTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const dto = purchaseTicketSchema.parse(req.body);
  const ticket = await ticketsService.purchaseTicket(req.user!.sub, dto);
  sendSuccess(res, ticket, 201);
});

export const cancelTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = ticketIdParamSchema.parse(req.params);
  await ticketsService.cancelTicket(id, req.user!.sub);
  sendSuccess(res, null, 204);
});

export const transferTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = ticketIdParamSchema.parse(req.params);
  const dto = transferTicketSchema.parse(req.body);
  const result = await ticketsService.transferTicket(id, req.user!.sub, dto);
  sendSuccess(res, result);
});
