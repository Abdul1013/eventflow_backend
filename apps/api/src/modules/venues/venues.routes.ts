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
