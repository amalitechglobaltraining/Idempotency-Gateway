import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentRequest, PaymentResponse } from '../src/domain/types.js';
import { createApp } from '../src/app.js';

const response: PaymentResponse = {
  transactionId: 'transaction-123',
  status: 'SUCCESS',
  message: 'Charged 100 USD',
  amount: 100,
  currency: 'USD',
};

describe('HTTP API', () => {
  it('reports health', async () => {
    const result = await request(createApp()).get('/health');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'ok' });
  });

  it('rejects a missing idempotency key', async () => {
    const result = await request(createApp()).post('/process-payment').send({ amount: 100, currency: 'USD' });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'A valid Idempotency-Key header is required.' });
  });

  it.each([
    ['whitespace-only', '   '],
    ['longer than 255 characters', 'a'.repeat(256)],
  ])('rejects an idempotency key that is %s', async (_name, key) => {
    const result = await request(createApp())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send({ amount: 100, currency: 'USD' });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'A valid Idempotency-Key header is required.' });
  });

  it.each([
    ['zero amount', { amount: 0, currency: 'USD' }],
    ['negative amount', { amount: -1, currency: 'USD' }],
    ['non-number amount', { amount: '100', currency: 'USD' }],
    ['missing amount', { currency: 'USD' }],
    ['lowercase currency', { amount: 100, currency: 'usd' }],
    ['two-letter currency', { amount: 100, currency: 'US' }],
    ['missing currency', { amount: 100 }],
  ])('rejects payment with %s without running the simulator', async (_name, body) => {
    const processPayment = vi.fn<(payment: PaymentRequest) => Promise<PaymentResponse>>();
    const result = await request(createApp({ processPayment }))
      .post('/process-payment')
      .set('Idempotency-Key', 'valid-key')
      .send(body);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'A valid payment with amount and currency is required.' });
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('returns the same completed result for a duplicate key', async () => {
    const processPayment = vi.fn(async () => response);
    const app = createApp({ processPayment });

    const first = await request(app).post('/process-payment').set('Idempotency-Key', 'payment-1').send({ amount: 100, currency: 'USD' });
    const duplicate = await request(app).post('/process-payment').set('Idempotency-Key', 'payment-1').send({ amount: 100, currency: 'USD' });

    expect(first.status).toBe(201);
    expect(first.body).toEqual(response);
    expect(first.headers['x-cache-hit']).toBe('false');
    expect(duplicate.status).toBe(201);
    expect(duplicate.body).toEqual(response);
    expect(duplicate.headers['x-cache-hit']).toBe('true');
    expect(processPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a key for a different payment', async () => {
    const app = createApp({ processPayment: vi.fn(async () => response) });
    await request(app).post('/process-payment').set('Idempotency-Key', 'payment-1').send({ amount: 100, currency: 'USD' });

    const conflict = await request(app).post('/process-payment').set('Idempotency-Key', 'payment-1').send({ amount: 500, currency: 'USD' });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: 'Idempotency key already used for a different request body.' });
  });

  it('returns a safe error for malformed JSON', async () => {
    const result = await request(createApp())
      .post('/process-payment')
      .set('Idempotency-Key', 'payment-1')
      .set('Content-Type', 'application/json')
      .send('{invalid');

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'Request body must be valid JSON.' });
  });

  it('returns a safe error when the simulator rejects', async () => {
    const processPayment = vi.fn(async () => { throw new Error('processor secret'); });
    const result = await request(createApp({ processPayment }))
      .post('/process-payment')
      .set('Idempotency-Key', 'payment-1')
      .send({ amount: 100, currency: 'USD' });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'An unexpected error occurred.' });
    expect(result.text).not.toContain('processor secret');
    expect(result.text).not.toContain('Error:');
  });
});
