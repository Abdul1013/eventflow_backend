import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('POST /api/v1/checkin/scan', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/checkin/scan').send({ qrToken: 'fake' });
    expect(res.status).toBe(401);
  });
});
