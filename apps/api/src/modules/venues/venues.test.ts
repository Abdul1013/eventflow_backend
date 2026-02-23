import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('GET /api/v1/venues', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/venues');
    expect(res.status).toBe(401);
  });
});
