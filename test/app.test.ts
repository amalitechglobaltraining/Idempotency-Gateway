import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentRequest, PaymentResponse } from '../src/domain/types.js';
import { createApp } from '../src/app.js';
import { validateIdempotencyKey } from '../src/http/validation.js';
import { InMemoryIdempotencyRepository } from '../src/storage/idempotency-repository.js';

const response: PaymentResponse = {
  transactionId: 'transaction-123',
  status: 'SUCCESS',
  message: 'Charged 100 USD',
  amount: 100,
  currency: 'USD',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function paymentJsonOfSize(byteLength: number): string {
  const empty = JSON.stringify({ amount: 100, currency: 'USD', padding: '' });
  return JSON.stringify({
    amount: 100,
    currency: 'USD',
    padding: 'x'.repeat(byteLength - Buffer.byteLength(empty)),
  });
}

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
    ['boolean amount', { amount: true, currency: 'USD' }],
    ['object amount', { amount: {}, currency: 'USD' }],
    ['missing amount', { currency: 'USD' }],
    ['lowercase currency', { amount: 100, currency: 'usd' }],
    ['two-letter currency', { amount: 100, currency: 'US' }],
    ['four-letter currency', { amount: 100, currency: 'USDD' }],
    ['missing currency', { amount: 100 }],
    ['array body', []],
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

  it('rejects a null JSON body without running the simulator', async () => {
    const processPayment = vi.fn<(payment: PaymentRequest) => Promise<PaymentResponse>>();
    const result = await request(createApp({ processPayment }))
      .post('/process-payment')
      .set('Idempotency-Key', 'valid-key')
      .set('Content-Type', 'application/json')
      .send('null');

    expect(result.status).toBe(400);
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('accepts an idempotency key at the 255-character raw boundary', async () => {
    const processPayment = vi.fn(async () => response);
    const result = await request(createApp({ processPayment }))
      .post('/process-payment')
      .set('Idempotency-Key', 'a'.repeat(255))
      .send({ amount: 100, currency: 'USD' });

    expect(result.status).toBe(201);
    expect(processPayment).toHaveBeenCalledOnce();
  });

  it('applies the 255-character limit before trimming the raw key', () => {
    expect(validateIdempotencyKey(` ${'a'.repeat(254)} `)).toBeUndefined();
    expect(validateIdempotencyKey('a'.repeat(255))).toBe('a'.repeat(255));
  });

  it('rejects duplicate Idempotency-Key field occurrences', async () => {
    const processPayment = vi.fn(async () => response);
    const result = await request(createApp({ processPayment }))
      .post('/process-payment')
      .set('Idempotency-Key', ['key-1', 'key-2'] as unknown as string)
      .send({ amount: 100, currency: 'USD' });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'A valid Idempotency-Key header is required.' });
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

  it('shares one in-flight result between concurrent identical requests', async () => {
    const started = deferred<void>();
    const duplicateObserved = deferred<void>();
    const controlledResponse = deferred<PaymentResponse>();
    const repository = new InMemoryIdempotencyRepository();
    const find = repository.find.bind(repository);
    let paymentStarted = false;
    vi.spyOn(repository, 'find').mockImplementation((key) => {
      if (paymentStarted) {
        duplicateObserved.resolve();
      }
      return find(key);
    });
    const processPayment = vi.fn(() => {
      paymentStarted = true;
      started.resolve();
      return controlledResponse.promise;
    });
    const app = createApp({ processPayment, repository });

    const owner = request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'concurrent-payment')
      .send({ amount: 100, currency: 'USD' })
      .then((result) => result);
    await started.promise;
    const duplicate = request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'concurrent-payment')
      .send({ amount: 100, currency: 'USD' })
      .then((result) => result);

    await duplicateObserved.promise;
    controlledResponse.resolve(response);
    const [ownerResult, duplicateResult] = await Promise.all([owner, duplicate]);

    expect(ownerResult.status).toBe(201);
    expect(ownerResult.body).toEqual(response);
    expect(ownerResult.headers['x-cache-hit']).toBe('false');
    expect(duplicateResult.status).toBe(201);
    expect(duplicateResult.body).toEqual(response);
    expect(duplicateResult.headers['x-cache-hit']).toBe('true');
    expect(processPayment).toHaveBeenCalledOnce();
  });

  it('rejects a conflicting request while the owner remains in flight', async () => {
    const started = deferred<void>();
    const controlledResponse = deferred<PaymentResponse>();
    const processPayment = vi.fn(() => {
      started.resolve();
      return controlledResponse.promise;
    });
    const app = createApp({ processPayment });
    const owner = request(app)
      .post('/process-payment')
      .set('Idempotency-Key', 'in-flight-conflict')
      .send({ amount: 100, currency: 'USD' })
      .then((result) => result);

    await started.promise;
    try {
      const conflict = await request(app)
        .post('/process-payment')
        .set('Idempotency-Key', 'in-flight-conflict')
        .send({ amount: 500, currency: 'USD' });

      expect(conflict.status).toBe(409);
      expect(conflict.body).toEqual({ error: 'Idempotency key already used for a different request body.' });
      expect(conflict.headers['x-cache-hit']).toBe('false');
      expect(processPayment).toHaveBeenCalledOnce();
    } finally {
      controlledResponse.resolve(response);
      await owner;
    }
  });

  it('rejects reuse of a key for a different payment', async () => {
    const app = createApp({ processPayment: vi.fn(async () => response) });
    await request(app).post('/process-payment').set('Idempotency-Key', 'payment-1').send({ amount: 100, currency: 'USD' });

    const conflict = await request(app).post('/process-payment').set('Idempotency-Key', 'payment-1').send({ amount: 500, currency: 'USD' });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: 'Idempotency key already used for a different request body.' });
    expect(conflict.headers['x-cache-hit']).toBe('false');
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

  it('accepts JSON exactly at the 100kb parser boundary', async () => {
    const rawBody = paymentJsonOfSize(102_400);
    expect(Buffer.byteLength(rawBody)).toBe(102_400);

    const result = await request(createApp({ processPayment: vi.fn(async () => response) }))
      .post('/process-payment')
      .set('Idempotency-Key', 'boundary-payment')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(result.status).toBe(201);
    expect(result.body).toEqual(response);
  });

  it('rejects JSON one byte over the 100kb parser boundary', async () => {
    const rawBody = paymentJsonOfSize(102_401);
    expect(Buffer.byteLength(rawBody)).toBe(102_401);

    const result = await request(createApp())
      .post('/process-payment')
      .set('Idempotency-Key', 'oversized-payment')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(result.status).toBe(413);
    expect(result.body).toEqual({ error: 'Request body is too large.' });
  });

  it('does not misclassify an unrelated SyntaxError carrying a body', async () => {
    const processPayment = vi.fn(async () => {
      const error = new SyntaxError('processor parser detail') as SyntaxError & { body: string };
      error.body = 'internal processor body';
      throw error;
    });
    const result = await request(createApp({ processPayment }))
      .post('/process-payment')
      .set('Idempotency-Key', 'payment-1')
      .send({ amount: 100, currency: 'USD' });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'An unexpected error occurred.' });
    expect(result.text).not.toContain('processor parser detail');
    expect(result.text).not.toContain('internal processor body');
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
