import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import * as eventsService from './events.service.js';
import type { EventStatus } from '@prisma/client';
import {
  createEventSchema,
  updateEventSchema,
  eventStatusSchema,
  listEventsQuerySchema,
  eventIdParamSchema,
} from './events.dto.js';

export const listEvents: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listEventsQuerySchema.parse(req.query);
  const isAdmin = req.user?.role === 'ADMIN';
  const result = await eventsService.listEvents(query, isAdmin);
  // Return result as data object so consumers access r.data.data.events
  sendSuccess(res, result, 200, { page: result.page, total: result.total, limit: result.limit });
});

export const getEvent: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const event = await eventsService.getEventById(id);
  sendSuccess(res, event);
});

export const createEvent: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const dto = createEventSchema.parse(req.body);
  const event = await eventsService.createEvent(req.user!.sub, dto);
  sendSuccess(res, event, 201);
});

export const updateEvent: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const dto = updateEventSchema.parse(req.body);
  const event = await eventsService.updateEvent(id, dto);
  sendSuccess(res, event);
});

export const deleteEvent: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  await eventsService.softDeleteEvent(id);
  sendSuccess(res, null, 204);
});

export const updateEventStatus: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const { status } = eventStatusSchema.parse(req.body);
  const event = await eventsService.updateEventStatus(id, status as EventStatus);
  sendSuccess(res, event);
});
