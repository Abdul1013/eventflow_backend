import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { verificationEmailTemplate } from './templates/verificationEmail.js';
import { passwordResetEmailTemplate } from './templates/passwordResetEmail.js';
import { ticketEmailTemplate } from './templates/ticketEmail.js';

// Resend client is only instantiated when the API key is present.
// When RESEND_API_KEY is unset (e.g. CI / test), silentSend returns early.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Use onboarding@resend.dev in development (no domain verification required).
// In production, replace with a verified sender from your Resend dashboard.
const FROM =
  env.NODE_ENV === 'production'
    ? 'EventFlow <tickets@eventflowng.store>'
    : 'EventFlow <onboarding@resend.dev>';

/** Wraps resend.emails.send — never throws; logs on failure instead. */
const silentSend = async (
  payload: Parameters<Resend['emails']['send']>[0],
): Promise<void> => {
  if (!resend) {
    logger.warn('[email] RESEND_API_KEY not set — skipping email send');
    return;
  }
  // In development, Resend only delivers to the account owner's email.
  // Redirect all sends to DEV_EMAIL_RECIPIENT so you can test the full flow.
  const originalTo = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
  const actualTo: string =
    env.NODE_ENV !== 'production' && env.DEV_EMAIL_RECIPIENT
      ? env.DEV_EMAIL_RECIPIENT
      : originalTo;

  if (actualTo !== originalTo) {
    logger.info(`[email] DEV: redirecting ${originalTo} → ${actualTo}`);
  }

  logger.info({ to: actualTo, subject: payload.subject }, '[email] Attempting send');
  try {
    const { data, error } = await resend.emails.send({ ...payload, to: actualTo });
    if (error) {
      logger.error({ error }, '[email] Send failed');
      return;
    }
    logger.info({ id: data?.id, to: actualTo }, '[email] Sent');
  } catch (err) {
    logger.error({ err }, '[email] Unexpected error');
  }
};

// ─── Auth emails ──────────────────────────────────────────────────────────────

export const sendVerificationEmail = (
  to: string,
  name: string,
  link: string,
): Promise<void> =>
  silentSend({
    from: FROM,
    to,
    subject: 'Verify your EventFlow account',
    html: verificationEmailTemplate(name, link),
  });

export const sendPasswordResetEmail = (
  to: string,
  name: string,
  link: string,
): Promise<void> =>
  silentSend({
    from: FROM,
    to,
    subject: 'Reset your EventFlow password',
    html: passwordResetEmailTemplate(name, link),
  });

// ─── Ticket email ─────────────────────────────────────────────────────────────

export const sendTicketEmail = (
  to: string,
  name: string,
  eventTitle: string,
  eventDate: string,
  venueName: string,
  seatInfo: string,
  ticketType: string,
  qrDataUrl: string,
): Promise<void> =>
  silentSend({
    from: FROM,
    to,
    subject: `Your ticket for ${eventTitle}`,
    html: ticketEmailTemplate(name, eventTitle, eventDate, venueName, seatInfo, ticketType, qrDataUrl),
  });
