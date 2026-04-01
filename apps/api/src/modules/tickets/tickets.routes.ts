import { Router, type IRouter } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as ticketsController from './tickets.controller.js';

export const ticketsRouter: IRouter = Router();

ticketsRouter.use(authenticate);

ticketsRouter.get('/', authorize('ATTENDEE', 'ADMIN'), ticketsController.listMyTickets);
ticketsRouter.post('/', authorize('ATTENDEE'), ticketsController.purchaseTicket);
ticketsRouter.get('/:id', authorize('ATTENDEE', 'ADMIN'), ticketsController.getTicket);
ticketsRouter.post('/:id/cancel', authorize('ATTENDEE', 'ADMIN'), ticketsController.cancelTicket);
ticketsRouter.post('/:id/transfer', authorize('ATTENDEE'), ticketsController.transferTicket);

/**
 * @swagger
 * /tickets:
 *   get:
 *     summary: List my tickets
 *     description: Returns tickets belonging to the authenticated user. Admins see all tickets.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, USED, CANCELLED, TRANSFERRED] }
 *       - in: query
 *         name: eventId
 *         schema: { type: string, format: uuid }
 *         description: Filter by event
 *     responses:
 *       200:
 *         description: Paginated ticket list (qrToken is omitted from list responses)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/TicketSummary' }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *   post:
 *     summary: Purchase a ticket
 *     description: >
 *       Creates an ACTIVE ticket for the authenticated attendee.
 *       Optional seating preferences are stored for the allocation engine.
 *       A confirmation email with QR code is sent asynchronously.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PurchaseTicketBody'
 *     responses:
 *       201:
 *         description: Ticket purchased
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/TicketDetail' }
 *       400:
 *         description: Ticket type sold out or event not accepting purchases
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: ATTENDEE role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Event or ticket type not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /tickets/{id}:
 *   get:
 *     summary: Get a single ticket with QR code
 *     description: Returns full details including the base64 `qrToken`. Returns 403 if the ticket belongs to another user.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket with QR code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/TicketDetail' }
 *       403:
 *         description: Ticket belongs to another user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Ticket not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /tickets/{id}/cancel:
 *   post:
 *     summary: Cancel a ticket
 *     description: Sets status to CANCELLED. Attendees can only cancel their own tickets.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CancelTicketBody'
 *     responses:
 *       200:
 *         description: Ticket cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/TicketSummary' }
 *       400:
 *         description: Ticket already used or cancelled
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Cannot cancel another user's ticket
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Ticket not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /tickets/{id}/transfer:
 *   post:
 *     summary: Transfer a ticket to another user
 *     description: >
 *       Marks current ticket as TRANSFERRED, creates a new ACTIVE ticket for the recipient,
 *       and emails both parties. The recipient must have an existing account.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TransferTicketBody'
 *     responses:
 *       200:
 *         description: Transfer successful — returns new ticket issued to recipient
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/TicketDetail' }
 *       400:
 *         description: Ticket cannot be transferred (already used/cancelled/transferred)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Can only transfer your own tickets
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Recipient account not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
