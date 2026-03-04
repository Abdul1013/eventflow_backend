import crypto from 'crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { Errors } from './errors.js';

// ─── Internal helper ──────────────────────────────────────────────────────────

function computeHmac(ticketId: string, timestamp: string): string {
  return crypto
    .createHmac('sha256', env.HMAC_SECRET)
    .update(`${ticketId}.${timestamp}`)
    .digest('hex');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a one-time-use HMAC-signed token for a ticket.
 *
 * Token structure: base64url(ticketId + '.' + timestamp + '.' + hmac)
 * - ticketId  : UUID (no dots — uses hyphens only)
 * - timestamp : Date.now() as decimal string (no dots — always unique per call)
 * - hmac      : HMAC-SHA256 hex of "ticketId.timestamp"
 *
 * Two calls with the same ticketId always yield different tokens because
 * Date.now() advances between invocations.
 */
export function generateQrToken(ticketId: string): string {
  const timestamp = String(Date.now());
  const hmac = computeHmac(ticketId, timestamp);
  return Buffer.from(`${ticketId}.${timestamp}.${hmac}`).toString('base64url');
}

/**
 * Verify a QR token — returns the embedded ticketId if the signature is valid.
 * Throws Errors.tokenInvalid() if the token is malformed or the HMAC check fails.
 *
 * Uses crypto.timingSafeEqual to prevent timing-based side-channel attacks.
 */
export function verifyQrToken(token: string): string {
  let raw: string;
  try {
    raw = Buffer.from(token, 'base64url').toString('utf-8');
  } catch {
    throw Errors.tokenInvalid();
  }

  // UUID has no dots; timestamp is a number (no dots); hmac hex has no dots.
  // Exactly two dots in the decoded string means three segments.
  const dotCount = (raw.match(/\./g) ?? []).length;
  if (dotCount !== 2) throw Errors.tokenInvalid();

  const firstDot = raw.indexOf('.');
  const lastDot = raw.lastIndexOf('.');

  const ticketId = raw.slice(0, firstDot);
  const timestamp = raw.slice(firstDot + 1, lastDot);
  const embeddedHmac = raw.slice(lastDot + 1);

  if (!ticketId || !timestamp || !embeddedHmac) throw Errors.tokenInvalid();

  const expectedHmac = computeHmac(ticketId, timestamp);

  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  const embeddedBuf = Buffer.from(embeddedHmac, 'hex');

  if (
    expectedBuf.length !== embeddedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, embeddedBuf)
  ) {
    throw Errors.tokenInvalid();
  }

  return ticketId;
}

/**
 * Generate a base64 PNG data URL of the QR code for a given token.
 * Error-correction level H allows up to 30% of codewords to be restored.
 */
export async function generateQrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
    color: { dark: '#111827', light: '#ffffff' },
  });
}
