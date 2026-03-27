import { Router, type IRouter } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as adminController from './admin.controller.js';

export const adminRouter: IRouter = Router();

adminRouter.use(authenticate, authorize('ADMIN'));

adminRouter.get('/stats', adminController.getStats);
adminRouter.get('/users', adminController.listUsers);
adminRouter.patch('/users/:id/role', adminController.updateUserRole);
adminRouter.get('/events/:id/analytics', adminController.getEventAnalytics);
adminRouter.get('/events/:id/tickets', adminController.getEventTickets);
adminRouter.get('/tickets/:id', adminController.getTicket);

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Platform dashboard statistics
 *     description: Returns aggregate counts for events, tickets, users, and revenue across the entire platform.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/DashboardStats' }
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /admin/users:
 *   get:
 *     summary: List all platform users
 *     description: Returns a paginated list of all users with their roles and verification status.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated user list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/UserSummary' }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /admin/users/{id}/role:
 *   patch:
 *     summary: Update a user's role
 *     description: Promotes or demotes a user to ADMIN, STAFF, or ATTENDEE.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Target user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleBody'
 *     responses:
 *       200:
 *         description: Role updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/UserSummary' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /admin/events/{id}/analytics:
 *   get:
 *     summary: Get detailed analytics for an event
 *     description: >
 *       Returns sales-over-time, check-in-over-time, ticket type breakdown,
 *       revenue total, capacity stats, and allocation history.
 *       Time-series data is computed via raw SQL for performance.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/EventAnalytics' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /admin/events/{id}/tickets:
 *   get:
 *     summary: List all tickets for a specific event
 *     description: Returns all tickets sold for an event, including attendee names and seat assignments.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Event ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated ticket list for the event
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
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /admin/tickets/{id}:
 *   get:
 *     summary: Get any ticket by ID (admin view)
 *     description: Retrieves full ticket details including QR token. Unlike the attendee endpoint, admin can access any ticket.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Full ticket details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/TicketDetail' }
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
 */
