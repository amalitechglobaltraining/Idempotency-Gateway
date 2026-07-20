import { describe, expect, it } from 'vitest';

import { InMemoryIdempotencyRepository } from '../src/storage/idempotency-repository.js';

describe('InMemoryIdempotencyRepository', () => {
  it('allows only the first claim for an idempotency key', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);

    expect(repository.claim('payment-1', 'hash-1')).toBe(true);
    expect(repository.claim('payment-1', 'hash-1')).toBe(false);
  });

  it('stores the completed response and its retention timestamps', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);
    const responseBody = { transactionId: 'txn-1', status: 'SUCCESS' as const };

    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, responseBody);

    expect(repository.find('payment-1')).toMatchObject({
      status: 'COMPLETED',
      responseStatus: 201,
      responseBody,
      completedAt: 1_000,
      expiresAt: 86_401_000,
    });
  });

  it('removes a completed record after its retention period', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);

    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, { transactionId: 'txn-1' });
    now = 86_401_001;

    expect(repository.find('payment-1')).toBeUndefined();
  });

  it('keeps a processing record indefinitely', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);

    repository.claim('payment-1', 'hash-1');
    now = Number.MAX_SAFE_INTEGER;

    expect(repository.find('payment-1')).toMatchObject({ status: 'PROCESSING' });
  });
});
