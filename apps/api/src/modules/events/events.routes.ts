import { Router, type IRouter } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middleware/optionalAuth.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as eventsController from './events.controller.js';

export const eventsRouter: IRouter = Router();

// Multer: memory storage, images only, 5 MB cap
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

// ── Public / optional-auth routes
eventsRouter.get('/', optionalAuth, eventsController.listEvents);
eventsRouter.get('/:id', optionalAuth, eventsController.getEvent);
eventsRouter.get('/:id/seats', optionalAuth, eventsController.getEventSeats);

// ── Admin-only mutations 
eventsRouter.post('/', authenticate, authorize('ADMIN'), eventsController.createEvent);
eventsRouter.patch('/:id', authenticate, authorize('ADMIN'), eventsController.updateEvent);
eventsRouter.delete('/:id', authenticate, authorize('ADMIN'), eventsController.deleteEvent);
eventsRouter.patch('/:id/status', authenticate, authorize('ADMIN'), eventsController.updateEventStatus);
eventsRouter.post('/:id/banner', authenticate, authorize('ADMIN'), upload.single('image'), eventsController.uploadEventBanner);
eventsRouter.post('/:id/allocate', authenticate, authorize('ADMIN'), eventsController.runAllocation);
eventsRouter.get('/:id/allocations', authenticate, authorize('ADMIN'), eventsController.getAllocations);
eventsRouter.post('/:id/allocate/compare', authenticate, authorize('ADMIN'), eventsController.runAllocationComparison);

/**
 * @swagger
 * /events:
 *   get:
 *     summary: List events
 *     description: >
 *       Paginated event list. Unauthenticated callers see only PUBLISHED/ONGOING events.
 *       Admins see all statuses.
 *     tags: [Events]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search on title and description
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, PUBLISHED, ONGOING, ENDED, CANCELLED] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [startsAt, createdAt, title], default: startsAt }
 *       - in: query
 *         name: venueId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Paginated event list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/EventSummary' }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEventBody'
 *     responses:
 *       201:
 *         description: Event created with DRAFT status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/EventSummary' }
 *       403:
 *         description: Insufficient permissions (ADMIN required)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}:
 *   get:
 *     summary: Get event details
 *     tags: [Events]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Full event details including ticket types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/EventSummary' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *   patch:
 *     summary: Update event fields
 *     description: Partial update — only send the fields to change. Ticket types cannot be changed here.
 *     tags: [Events]
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
 *             $ref: '#/components/schemas/UpdateEventBody'
 *     responses:
 *       200:
 *         description: Event updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/EventSummary' }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *   delete:
 *     summary: Soft-delete an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Event deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Event deleted }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}/status:
 *   patch:
 *     summary: Update event lifecycle status
 *     description: Valid transitions — DRAFT→PUBLISHED, PUBLISHED→ONGOING, ONGOING→ENDED, any→CANCELLED.
 *     tags: [Events]
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
 *             $ref: '#/components/schemas/EventStatusBody'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/EventSummary' }
 *       400:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}/banner:
 *   post:
 *     summary: Upload event banner image
 *     description: Accepts `multipart/form-data` with an `image` field (JPEG/PNG, max 5 MB). Stored on Cloudinary.
 *     tags: [Events]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Banner uploaded — returns updated event with bannerUrl
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/EventSummary' }
 *       400:
 *         description: No file provided or unsupported format
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}/seats:
 *   get:
 *     summary: Get venue seat map for an event
 *     description: Returns all seats with their allocation status.
 *     tags: [Events]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Seat list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Seat' }
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}/allocate:
 *   post:
 *     summary: Run greedy seat allocation
 *     description: >
 *       Assigns unallocated tickets to seats using the SAO greedy algorithm,
 *       respecting attendee preferences (group size, accessibility).
 *       Commits the assignment to the database.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Allocation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/AllocationRun' }
 *       400:
 *         description: Event not eligible for allocation (no unallocated tickets or wrong status)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}/allocations:
 *   get:
 *     summary: List all allocation runs for an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Allocation history (most recent first)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AllocationRun' }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /events/{id}/allocate/compare:
 *   post:
 *     summary: Compare allocation algorithms without committing
 *     description: >
 *       Runs both the greedy and k-means algorithms in dry-run mode and returns
 *       side-by-side performance metrics. No seats are assigned.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Comparison metrics for both algorithms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     greedy: { $ref: '#/components/schemas/AllocationRun' }
 *                     kmeans: { $ref: '#/components/schemas/AllocationRun' }
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
