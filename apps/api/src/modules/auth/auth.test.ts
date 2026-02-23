import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

// TODO (Week 1): add proper test DB setup/teardown
describe('POST /api/v1/auth/register', () => {
  it('returns 422 when body is invalid', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 201 with valid body', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Test User',
      email: `test+${Date.now()}@example.com`,
      password: 'securepassword123',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toContain('@');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 401 with wrong credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});
