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
      body: { error: 'Idempotency key already used for a different request body.' },
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
        body: { error: 'Idempotency key already used for a different request body.' },
        cacheHit: false,
      });
      expect(simulator).toHaveBeenCalledOnce();
    } finally {
      release(response);
      await owner;
    }
  });

  it('releases a failed owner so an identical request can retry', async () => {
    const failure = new Error('processor unavailable');
    let rejectFirst!: (reason: Error) => void;
    const firstAttempt = new Promise<PaymentResponse>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const simulator = vi.fn()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce(response);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), simulator);

    const owner = service.process('payment-1', { amount: 100, currency: 'GHS' });
    const waiter = service.process('payment-1', { currency: 'GHS', amount: 100 });
    const settledPromise = Promise.allSettled([owner, waiter]);
    rejectFirst(failure);

    const settled = await settledPromise;
    expect(settled).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);
    await expect(service.process('payment-1', { amount: 100, currency: 'GHS' })).resolves.toEqual({
      statusCode: 201,
      body: response,
      cacheHit: false,
    });
    expect(simulator).toHaveBeenCalledTimes(2);
  });

  it('isolates concurrent results and the completed replay from mutation', async () => {
    let release!: (value: PaymentResponse) => void;
    const controlled = new Promise<PaymentResponse>((resolve) => {
      release = resolve;
    });
    const simulator = vi.fn().mockReturnValue(controlled);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), simulator);

    const ownerPromise = service.process('payment-1', { amount: 100, currency: 'GHS' });
    const waiterPromise = service.process('payment-1', { currency: 'GHS', amount: 100 });
    release(response);
    const [owner, waiter] = await Promise.all([ownerPromise, waiterPromise]);
    (owner.body as PaymentResponse).message = 'mutated';

    expect(waiter.body).toEqual(response);
    const replay = await service.process('payment-1', { amount: 100, currency: 'GHS' });
    expect(replay.body).toEqual(response);
  });
});
