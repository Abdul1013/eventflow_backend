import { describe, it, expect } from 'vitest';
import { generateQrToken, verifyQrToken, generateQrDataUrl } from './qr.js';

// crypto.randomUUID is available in Node 15+
const TICKET_ID = crypto.randomUUID();

describe('qr.generateQrToken + verifyQrToken', () => {
  it('round-trip succeeds — verifyQrToken returns the original ticketId', () => {
    const token = generateQrToken(TICKET_ID);
    expect(verifyQrToken(token)).toBe(TICKET_ID);
  });

  it('tampered token (first character flipped) throws TOKEN_INVALID', () => {
    const token = generateQrToken(TICKET_ID);
    // Flip the first character to a different base64url char
    const flipped = token[0] === 'A' ? 'B' : 'A';
    const tampered = flipped + token.slice(1);
    expect(() => verifyQrToken(tampered)).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('token with a different ticketId substituted throws TOKEN_INVALID', () => {
    const token = generateQrToken(TICKET_ID);

    // Decode the token, replace the ticketId segment with a different UUID, re-encode
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = raw.split('.');
    const differentId = crypto.randomUUID();
    const tamperedRaw = [differentId, parts[1], parts[2]].join('.');
    const tamperedToken = Buffer.from(tamperedRaw).toString('base64url');

    expect(() => verifyQrToken(tamperedToken)).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('two calls with the same ticketId produce different tokens', async () => {
    const token1 = generateQrToken(TICKET_ID);
    // Brief pause ensures Date.now() advances
    await new Promise((r) => setTimeout(r, 5));
    const token2 = generateQrToken(TICKET_ID);

    expect(token1).not.toBe(token2);
    // Both tokens must still decode to the same ticketId
    expect(verifyQrToken(token1)).toBe(TICKET_ID);
    expect(verifyQrToken(token2)).toBe(TICKET_ID);
  });

  it('completely invalid (random) string throws TOKEN_INVALID', () => {
    expect(() => verifyQrToken('not-a-real-token')).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });
});

describe('qr.generateQrDataUrl', () => {
  it('returns a PNG data URL', async () => {
    const token = generateQrToken(TICKET_ID);
    const dataUrl = await generateQrDataUrl(token);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
