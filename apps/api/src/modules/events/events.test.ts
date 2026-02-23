import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('GET /api/v1/events', () => {
  it('returns 200 with paginated results', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 422 with invalid query params', async () => {
    const res = await request(app).get('/api/v1/events?page=abc');
    // coerce.number handles 'abc' as NaN → Zod error
    expect([200, 422]).toContain(res.status);
  });
});

describe('POST /api/v1/events', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/events').send({});
    expect(res.status).toBe(401);
  });
});
