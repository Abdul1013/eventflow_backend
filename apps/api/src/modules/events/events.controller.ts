import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import { Errors } from '../../lib/errors.js';
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

export const uploadEventBanner: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  if (!req.file) throw Errors.validation('Image file is required');
  const bannerUrl = await eventsService.uploadBanner(id, req.file.buffer);
  sendSuccess(res, { bannerUrl });
});

export const getEventSeats: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const data = await eventsService.getEventSeats(id);
  sendSuccess(res, data);
});

export const runAllocation: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const result = await eventsService.runAllocation(id);
  sendSuccess(res, result);
});

export const getAllocations: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const allocations = await eventsService.getAllocations(id);
  sendSuccess(res, allocations);
});

export const runAllocationComparison: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = eventIdParamSchema.parse(req.params);
  const result = await eventsService.runAllocationComparison(id);
  sendSuccess(res, result);
});
