import { Router, type IRouter } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as checkinController from './checkin.controller.js';

export const checkinRouter: IRouter = Router();

checkinRouter.use(authenticate);

// Staff or admin can scan tickets at the door
checkinRouter.post('/scan', authorize('STAFF', 'ADMIN'), checkinController.scanTicket);

// Admin-only manual override (damaged QR, printed ticket, etc.)
checkinRouter.post('/manual', authorize('ADMIN'), checkinController.manualCheckin);

// Stats dashboard — staff and admin
checkinRouter.get('/stats/:eventId', authorize('STAFF', 'ADMIN'), checkinController.getCheckinStats);

/**
 * @swagger
 * /checkin/scan:
 *   post:
 *     summary: Scan a QR code for check-in
 *     description: >
 *       Validates the QR token and marks the ticket as USED. Supports offline queuing —
 *       if offline, the client enqueues the scan and submits when connectivity returns.
 *       Returns a structured result code indicating the outcome.
 *     tags: [Check-in]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScanBody'
 *     responses:
 *       200:
 *         description: Scan processed — check `result` field for outcome
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/ScanResult' }
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: STAFF or ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /checkin/manual:
 *   post:
 *     summary: Manual check-in by ticket ID
 *     description: >
 *       Admin-only override for damaged QR codes or printed tickets.
 *       Looks up the ticket directly by UUID and marks it USED.
 *     tags: [Check-in]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManualCheckinBody'
 *     responses:
 *       200:
 *         description: Check-in recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/ScanResult' }
 *       400:
 *         description: Ticket already used or cancelled
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Ticket not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /checkin/stats/{eventId}:
 *   get:
 *     summary: Get live check-in statistics for an event
 *     description: >
 *       Returns aggregate counts and the 20 most recent scan entries.
 *       Auto-refreshed by the mobile scanner app every 30 seconds.
 *     tags: [Check-in]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Live check-in stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/CheckInStats' }
 *       403:
 *         description: STAFF or ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
