import { Router, type IRouter } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as authController from './auth.controller.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.dto.js';

export const authRouter: IRouter = Router();

authRouter.post('/register', validate(registerSchema), authController.register);
authRouter.post('/login', validate(loginSchema), authController.login);
// refresh + logout read the cookie — no body validation needed
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
authRouter.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
// Email verification — public, token comes from the link in the registration email
authRouter.get('/verify-email', authController.verifyEmail);
// Protected — requires valid Bearer token
authRouter.get('/me', authenticate, authController.getMe);
