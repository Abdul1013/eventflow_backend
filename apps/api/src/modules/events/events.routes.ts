import { Router, type IRouter } from 'express';
import { optionalAuth } from '../../middleware/optionalAuth.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as eventsController from './events.controller.js';

export const eventsRouter: IRouter = Router();

// ── Public / optional-auth routes ────────────────────────────────────────────
// Unauthenticated users see only PUBLISHED events;
// admins with a valid token see all statuses.
eventsRouter.get('/', optionalAuth, eventsController.listEvents);
eventsRouter.get('/:id', optionalAuth, eventsController.getEvent);

// ── Admin-only mutations ──────────────────────────────────────────────────────
eventsRouter.post('/', authenticate, authorize('ADMIN'), eventsController.createEvent);
eventsRouter.patch('/:id', authenticate, authorize('ADMIN'), eventsController.updateEvent);
eventsRouter.delete('/:id', authenticate, authorize('ADMIN'), eventsController.deleteEvent);
eventsRouter.patch('/:id/status', authenticate, authorize('ADMIN'), eventsController.updateEventStatus);
