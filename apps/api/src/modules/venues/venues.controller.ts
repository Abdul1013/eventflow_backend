import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import * as venuesService from './venues.service.js';
import {
  createVenueSchema,
  updateVenueSchema,
  venueIdParamSchema,
} from './venues.dto.js';

export const listVenues: RequestHandler = asyncHandler(async (_req: Request, res: Response) => {
  const venues = await venuesService.listVenues();
  sendSuccess(res, venues);
});

export const getVenue: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = venueIdParamSchema.parse(req.params);
  const venue = await venuesService.getVenueById(id);
  sendSuccess(res, venue);
});

export const createVenue: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const dto = createVenueSchema.parse(req.body);
  const venue = await venuesService.createVenue(dto);
  sendSuccess(res, venue, 201);
});

export const updateVenue: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = venueIdParamSchema.parse(req.params);
  const dto = updateVenueSchema.parse(req.body);
  const venue = await venuesService.updateVenue(id, dto);
  sendSuccess(res, venue);
});
