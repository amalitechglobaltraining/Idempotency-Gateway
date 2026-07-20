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
      idempotencyKey: 'payment-1',
      requestHash: 'hash-1',
      status: 'COMPLETED',
      responseStatus: 201,
      responseBody,
      completedAt: 1_000,
      expiresAt: 86_401_000,
    });
  });

  it('removes a completed record exactly at its expiration time', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);

    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, { transactionId: 'txn-1' });
    now = 86_401_000;

    expect(repository.find('payment-1')).toBeUndefined();
  });

  it('keeps a processing record indefinitely', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);

    repository.claim('payment-1', 'hash-1');
    now = Number.MAX_SAFE_INTEGER;

    expect(repository.find('payment-1')).toMatchObject({ status: 'PROCESSING' });
  });

  it('rejects repeated completion without changing the original result', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);

    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, { transactionId: 'txn-1' });
    const original = repository.find('payment-1');
    now = 2_000;

    expect(() =>
      repository.complete('payment-1', 500, { message: 'replacement' }),
    ).toThrow('Cannot complete an idempotency record that is already completed');
    expect(repository.find('payment-1')).toEqual(original);
  });

  it('snapshots the response body when completing a record', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);
    const responseBody = { transaction: { id: 'txn-1' } };

    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, responseBody);
    responseBody.transaction.id = 'mutated';

    expect(repository.find('payment-1')).toMatchObject({
      responseBody: { transaction: { id: 'txn-1' } },
    });
  });

  it('returns record snapshots that cannot mutate stored data', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);

    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, { transaction: { id: 'txn-1' } });
    const returned = repository.find('payment-1');
    if (returned?.status !== 'COMPLETED') {
      throw new Error('Expected a completed record');
    }
    (returned.responseBody as { transaction: { id: string } }).transaction.id = 'mutated';

    expect(repository.find('payment-1')).toMatchObject({
      responseBody: { transaction: { id: 'txn-1' } },
    });
  });

  it('deletes only expired completed records and returns their count', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);

    repository.claim('expired', 'hash-1');
    repository.complete('expired', 201, { transactionId: 'txn-1' });
    now = 2_000;
    repository.claim('current', 'hash-2');
    repository.complete('current', 201, { transactionId: 'txn-2' });
    repository.claim('processing', 'hash-3');
    now = 86_401_000;

    expect(repository.deleteExpired()).toBe(1);
    expect(repository.find('expired')).toBeUndefined();
    expect(repository.find('current')).toMatchObject({ status: 'COMPLETED' });
    expect(repository.find('processing')).toMatchObject({ status: 'PROCESSING' });
  });

  it('rejects completion for a missing idempotency key', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);

    expect(() => repository.complete('missing', 201, {})).toThrow(
      'Cannot complete an idempotency record that does not exist',
    );
  });
});
