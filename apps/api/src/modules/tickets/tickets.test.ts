import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('GET /api/v1/tickets', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/tickets');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/tickets', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/tickets').send({});
    expect(res.status).toBe(401);
  });
});
