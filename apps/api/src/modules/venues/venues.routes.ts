import { Router, type IRouter } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as venuesController from './venues.controller.js';

export const venuesRouter: IRouter = Router();

// All venue routes are admin-only
venuesRouter.get('/', authenticate, authorize('ADMIN'), venuesController.listVenues);
venuesRouter.post('/', authenticate, authorize('ADMIN'), venuesController.createVenue);
venuesRouter.get('/:id', authenticate, authorize('ADMIN'), venuesController.getVenue);
venuesRouter.patch('/:id', authenticate, authorize('ADMIN'), venuesController.updateVenue);

/**
 * @swagger
 * /venues:
 *   get:
 *     summary: List all venues
 *     description: Returns all venues with seat counts. Admin only.
 *     tags: [Venues]
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
 *         description: Venue list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/VenueDetail' }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *   post:
 *     summary: Create a new venue with seat map
 *     description: >
 *       Creates a venue and optionally generates its seat map from `sections`.
 *       Each section defines a row range (e.g. A–D) and seats per row.
 *       If no sections are provided, seats must be added manually.
 *     tags: [Venues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVenueBody'
 *     responses:
 *       201:
 *         description: Venue created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/VenueDetail' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 * /venues/{id}:
 *   get:
 *     summary: Get a single venue
 *     tags: [Venues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Venue details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/VenueDetail' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Venue not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *   patch:
 *     summary: Update venue details
 *     description: Partial update — send only the fields to change. Does not modify the existing seat map.
 *     tags: [Venues]
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
 *             type: object
 *             properties:
 *               name:     { type: string }
 *               address:  { type: string }
 *               city:     { type: string }
 *               capacity: { type: integer }
 *     responses:
 *       200:
 *         description: Venue updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/VenueDetail' }
 *       403:
 *         description: ADMIN role required
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Venue not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
