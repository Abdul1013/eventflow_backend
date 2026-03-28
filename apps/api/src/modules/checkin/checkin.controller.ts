import type { Request, Response, RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { sendSuccess } from '../../lib/response.js';
import * as checkinService from './checkin.service.js';
import { scanTicketSchema, manualCheckinSchema, statsParamSchema } from './checkin.dto.js';

//  scanTicket 
// Always returns HTTP 200 regardless of the scan outcome.
// The mobile scanner branches on `data.result`, not the HTTP status code.
// Using non-200 codes for INVALID / ALREADY_USED would require the client to
// handle HTTP errors and scan results separately — unnecessary complexity.

export const scanTicket: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token, deviceInfo } = scanTicketSchema.parse(req.body);
  const outcome = await checkinService.scanTicket(token, req.user!.sub, deviceInfo);
  sendSuccess(res, outcome, 200);
});

//  manualCheckin 

export const manualCheckin: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { ticketId } = manualCheckinSchema.parse(req.body);
  const outcome = await checkinService.manualCheckin(ticketId, req.user!.sub);
  sendSuccess(res, outcome, 200);
});

//  getCheckinStats

export const getCheckinStats: RequestHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { eventId } = statsParamSchema.parse(req.params);
    const stats = await checkinService.getCheckinStats(eventId);
    sendSuccess(res, stats);
  },
);
