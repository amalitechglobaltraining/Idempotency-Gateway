import { describe, expect, it, vi } from 'vitest';

import type { PaymentResponse } from '../src/domain/types.js';
import { PaymentService } from '../src/services/payment-service.js';
import { InMemoryIdempotencyRepository } from '../src/storage/idempotency-repository.js';

const response: PaymentResponse = {
  transactionId: 'txn-1',
  status: 'SUCCESS',
  message: 'Charged 100 GHS',
  amount: 100,
  currency: 'GHS',
};

describe('PaymentService', () => {
  it('processes the first request and replays an equivalent reordered request', async () => {
    const simulator = vi.fn().mockResolvedValue(response);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), simulator);

    const first = await service.process('payment-1', { amount: 100, currency: 'GHS' });
    const duplicate = await service.process('payment-1', { currency: 'GHS', amount: 100 });

    expect(first).toEqual({ statusCode: 201, body: response, cacheHit: false });
    expect(duplicate).toEqual({ statusCode: 201, body: response, cacheHit: true });
    expect(simulator).toHaveBeenCalledOnce();
  });

  it('rejects reuse of a completed key with a different request body', async () => {
    const simulator = vi.fn().mockResolvedValue(response);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), simulator);
    await service.process('payment-1', { amount: 100, currency: 'GHS' });

    const conflict = await service.process('payment-1', { amount: 500, currency: 'GHS' });

    expect(conflict).toEqual({
      statusCode: 409,
      body: 'Idempotency key already used for a different request body.',
      cacheHit: false,
    });
    expect(simulator).toHaveBeenCalledOnce();
  });

  it('shares one in-flight operation between concurrent identical requests', async () => {
    let release!: (value: PaymentResponse) => void;
    const controlled = new Promise<PaymentResponse>((resolve) => {
      release = resolve;
    });
    const simulator = vi.fn().mockReturnValue(controlled);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), simulator);

    const firstPromise = service.process('payment-1', { amount: 100, currency: 'GHS' });
    const duplicatePromise = service.process('payment-1', { currency: 'GHS', amount: 100 });
    release(response);

    await expect(firstPromise).resolves.toEqual({ statusCode: 201, body: response, cacheHit: false });
    await expect(duplicatePromise).resolves.toEqual({ statusCode: 201, body: response, cacheHit: true });
    expect(simulator).toHaveBeenCalledOnce();
  });

  it('rejects an in-flight conflicting body without awaiting the owner', async () => {
    let release!: (value: PaymentResponse) => void;
    const controlled = new Promise<PaymentResponse>((resolve) => {
      release = resolve;
    });
    const simulator = vi.fn().mockReturnValue(controlled);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), simulator);
    const owner = service.process('payment-1', { amount: 100, currency: 'GHS' });

    try {
      const conflict = service.process('payment-1', { amount: 500, currency: 'GHS' });
      const outcome = await Promise.race([
        conflict,
        new Promise<'still pending'>((resolve) => setTimeout(() => resolve('still pending'), 0)),
      ]);
      expect(outcome).toEqual({
        statusCode: 409,
        body: 'Idempotency key already used for a different request body.',
        cacheHit: false,
      });
      expect(simulator).toHaveBeenCalledOnce();
    } finally {
      release(response);
      await owner;
    }
  });
});
