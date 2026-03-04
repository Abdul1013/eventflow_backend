import { AppError } from './AppError.js';

/**
 * Centralised AppError factory functions.
 * All modules must use these — never construct AppError inline.
 * This guarantees error codes are typo-free and consistent across the API.
 */
export const Errors = {
  unauthorized: () =>
    new AppError('UNAUTHORIZED', 401, 'Authentication required'),

  forbidden: () =>
    new AppError('FORBIDDEN', 403, 'Insufficient permissions'),

  notFound: (resource: string) =>
    new AppError('NOT_FOUND', 404, `${resource} not found`),

  conflict: (msg: string) =>
    new AppError('CONFLICT', 409, msg),

  validation: (msg: string) =>
    new AppError('VALIDATION_ERROR', 400, msg),

  tokenExpired: () =>
    new AppError('TOKEN_EXPIRED', 401, 'Token has expired'),

  tokenInvalid: () =>
    new AppError('TOKEN_INVALID', 401, 'Token is invalid'),

  missingRefreshToken: () =>
    new AppError('MISSING_REFRESH_TOKEN', 401, 'Refresh token not provided'),

  invalidRefreshToken: () =>
    new AppError('INVALID_REFRESH_TOKEN', 401, 'Invalid or expired refresh token'),

  emailNotVerified: () =>
    new AppError('EMAIL_NOT_VERIFIED', 403, 'Please verify your email before logging in'),

  emailTaken: () =>
    new AppError('EMAIL_TAKEN', 409, 'Email already in use'),

  invalidCredentials: () =>
    new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password'),

  invalidResetToken: () =>
    new AppError('INVALID_RESET_TOKEN', 400, 'Invalid or expired reset token'),

  tokenInvalidOrExpired: () =>
    new AppError('TOKEN_INVALID_OR_EXPIRED', 400, 'Verification link is invalid or has expired'),

  passwordUnchanged: () =>
    new AppError('PASSWORD_UNCHANGED', 400, 'New password must differ from current password'),

  cannotDemoteSelf: () =>
    new AppError('CANNOT_DEMOTE_SELF', 403, 'You cannot change your own role'),

  eventNotEditable: () =>
    new AppError('EVENT_NOT_EDITABLE', 403, 'Only draft events can be edited'),

  invalidStatusTransition: (from: string, to: string) =>
    new AppError('INVALID_STATUS_TRANSITION', 400, `Cannot transition event from ${from} to ${to}`),

  eventNotDeletable: () =>
    new AppError('EVENT_NOT_DELETABLE', 403, 'Only draft or cancelled events can be deleted'),

  eventNotAllocatable: () =>
    new AppError('EVENT_NOT_ALLOCATABLE', 409, 'Event must be PUBLISHED or ONGOING to run allocation'),

  noSeatsAvailable: () =>
    new AppError('NO_SEATS_AVAILABLE', 409, 'No tickets remaining for this type'),

  ticketNotTransferable: () =>
    new AppError('TICKET_NOT_TRANSFERABLE', 409, 'Only active tickets can be transferred'),

  transferTargetNotFound: () =>
    new AppError('TRANSFER_TARGET_NOT_FOUND', 404, 'No account found with that email address'),

  transferTargetHasTicket: () =>
    new AppError('TRANSFER_TARGET_HAS_TICKET', 409, 'That user already has a ticket for this event'),

  ticketNotActive: () =>
    new AppError('TICKET_NOT_ACTIVE', 409, 'Only active tickets can be manually checked in'),
} as const;
