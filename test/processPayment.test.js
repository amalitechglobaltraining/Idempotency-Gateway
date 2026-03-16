const request = require('supertest');
const { app } = require('../index');
const idempotencyStore = require('../idempotencyStore');

beforeEach(() => idempotencyStore.clear());

describe('POST /process-payment', () => {
  it('processes a new payment (happy path)', async () => {
    const res = await request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'key1')
      .send({ amount: 100, currency: 'GHS' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('Charged 100 GHS');
    expect(res.headers['x-cache-hit']).toBeUndefined();
  });

  it('returns cached response for duplicate request', async () => {
    await request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'key2')
      .send({ amount: 50, currency: 'GHS' });
    const res = await request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'key2')
      .send({ amount: 50, currency: 'GHS' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('Charged 50 GHS');
    expect(res.headers['x-cache-hit']).toBe('true');
  });

  it('rejects same key with different body', async () => {
    await request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'key3')
      .send({ amount: 10, currency: 'GHS' });
    const res = await request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'key3')
      .send({ amount: 20, currency: 'GHS' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already used for a different request body/);
  });
  it('waits for in-flight request and returns same response', async () => {
    const key = 'inflight-key';
    const payload = { amount: 200, currency: 'GHS' };
    // Start first request but do not await
    const firstReq = request(app)
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(payload);
    // Wait a short moment to ensure the first is in-flight
    await new Promise(r => setTimeout(r, 200));
    // Start second request while first is still processing
    const secondReq = request(app)
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(payload);
    // Await both
    const [res1, res2] = await Promise.all([firstReq, secondReq]);
    // Both should succeed with same response
    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);
    expect(res1.body).toEqual(res2.body);
    // The second should have X-Cache-Hit: true
    expect(res2.headers['x-cache-hit']).toBe('true');
    // The first should not
    expect(res1.headers['x-cache-hit']).toBeUndefined();
  });
  it('enforces rate limiting per Idempotency-Key', async () => {
    jest.setTimeout(20000);
    const key = 'ratelimit-key';
    const payload = { amount: 10, currency: 'GHS' };
    // Send 5 requests (should all succeed)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/process-payment')
        .set('Idempotency-Key', key)
        .send(payload);
      expect(res.statusCode).toBe(201);
    }
    // 6th request with the same key should be rate limited
    const res = await request(app)
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(payload);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/Rate limit exceeded/);
  });
});
