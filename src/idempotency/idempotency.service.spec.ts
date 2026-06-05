import { HttpException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { StoredResponse } from './idempotency.types';

const BODY = { amount: 100, currency: 'GHS' };
const OK: StoredResponse = {
  statusCode: 201,
  body: { status: 'Charged 100 GHS', amount: 100, currency: 'GHS' },
};

/** A promise we can resolve/reject from the test to control an "in-flight" charge. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('IdempotencyService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic states', () => {
    it('processes a new key exactly once', async () => {
      const service = new IdempotencyService();
      const doWork = jest.fn().mockResolvedValue(OK);

      const result = await service.handle('k', BODY, doWork);

      expect(doWork).toHaveBeenCalledTimes(1);
      expect(result.cacheHit).toBe(false);
      expect(result.response).toEqual(OK);
    });

    it('replays a completed request without re-running work', async () => {
      const service = new IdempotencyService();
      const doWork = jest.fn().mockResolvedValue(OK);

      await service.handle('k', BODY, doWork);
      const replay = await service.handle('k', BODY, doWork);

      expect(doWork).toHaveBeenCalledTimes(1);
      expect(replay.cacheHit).toBe(true);
      expect(replay.response).toEqual(OK);
    });

    it('treats reordered object keys as the same body', async () => {
      const service = new IdempotencyService();
      const doWork = jest.fn().mockResolvedValue(OK);

      await service.handle('k', { amount: 100, currency: 'GHS' }, doWork);
      const replay = await service.handle('k', { currency: 'GHS', amount: 100 }, doWork);

      expect(replay.cacheHit).toBe(true);
      expect(doWork).toHaveBeenCalledTimes(1);
    });

    it('rejects a reused key with a different body (409)', async () => {
      const service = new IdempotencyService();
      await service.handle('k', { amount: 100, currency: 'GHS' }, jest.fn().mockResolvedValue(OK));

      const conflicting = jest.fn();
      let caught: unknown;
      try {
        await service.handle('k', { amount: 500, currency: 'GHS' }, conflicting);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(409);
      expect((caught as HttpException).message).toBe(
        'Idempotency key already used for a different request body.',
      );
      expect(conflicting).not.toHaveBeenCalled();
    });
  });

  describe('in-flight coalescing (race condition)', () => {
    it('runs work once for two concurrent duplicates and replays for the waiter', async () => {
      const service = new IdempotencyService();
      const d = deferred<StoredResponse>();
      const doWork = jest.fn(() => d.promise);

      const p1 = service.handle('k', BODY, doWork);
      const p2 = service.handle('k', BODY, doWork);

      expect(doWork).toHaveBeenCalledTimes(1); // B did not start a second charge

      d.resolve(OK);
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(doWork).toHaveBeenCalledTimes(1);
      expect(r1.cacheHit).toBe(false); // originator
      expect(r2.cacheHit).toBe(true); // waiter
      expect(r2.response).toEqual(r1.response);
    });

    it('coalesces 50 concurrent duplicates onto a single charge', async () => {
      const service = new IdempotencyService();
      const d = deferred<StoredResponse>();
      const doWork = jest.fn(() => d.promise);

      const calls = Array.from({ length: 50 }, () => service.handle('k', BODY, doWork));
      expect(doWork).toHaveBeenCalledTimes(1);

      d.resolve(OK);
      const results = await Promise.all(calls);

      expect(doWork).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => r.cacheHit)).toHaveLength(49); // 1 originator + 49 waiters
      results.forEach((r) => expect(r.response).toEqual(OK));
    });

    it('fails the originator and every waiter together when the charge rejects', async () => {
      const service = new IdempotencyService();
      const d = deferred<StoredResponse>();
      const doWork = jest.fn(() => d.promise);

      const p1 = service.handle('k', BODY, doWork);
      const p2 = service.handle('k', BODY, doWork);

      d.reject(new Error('charge failed'));

      await expect(p1).rejects.toThrow('charge failed');
      await expect(p2).rejects.toThrow('charge failed');
      expect(service.size()).toBe(0); // key freed for a clean retry

      const doWork2 = jest.fn().mockResolvedValue(OK);
      const r3 = await service.handle('k', BODY, doWork2);
      expect(doWork2).toHaveBeenCalledTimes(1);
      expect(r3.cacheHit).toBe(false);
    });

    it('does not emit an unhandledRejection on a zero-waiter failure', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      try {
        const service = new IdempotencyService();
        const doWork = jest.fn().mockRejectedValue(new Error('boom'));

        await expect(service.handle('k', BODY, doWork)).rejects.toThrow('boom');
        await new Promise((r) => setImmediate(r)); // let any pending rejection surface

        expect(unhandled).toHaveLength(0);
        expect(service.size()).toBe(0);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });

  describe('failure handling', () => {
    it('frees the key when the charge fails so a retry runs fresh', async () => {
      const service = new IdempotencyService();

      await expect(
        service.handle('k', BODY, jest.fn().mockRejectedValue(new Error('x'))),
      ).rejects.toThrow('x');
      expect(service.size()).toBe(0);

      const doWork2 = jest.fn().mockResolvedValue(OK);
      const retry = await service.handle('k', BODY, doWork2);
      expect(retry.cacheHit).toBe(false);
      expect(doWork2).toHaveBeenCalledTimes(1);
    });

    it('rejects and frees the key when the charge exceeds the watchdog timeout', async () => {
      jest.useFakeTimers();
      const service = new IdempotencyService({ inFlightTimeoutMs: 5000 });
      const never = new Promise<StoredResponse>(() => undefined); // never settles

      const p = service.handle('k', BODY, () => never);
      p.catch(() => undefined); // avoid a noisy unhandled rejection in the test

      await jest.advanceTimersByTimeAsync(5001);

      await expect(p).rejects.toThrow(/exceeded/i);
      expect(service.size()).toBe(0);
    });
  });

  describe('TTL / expiry', () => {
    it('treats an expired key as new on the next request (lazy eviction)', async () => {
      jest.useFakeTimers();
      const service = new IdempotencyService({ ttlMs: 1000 });
      const doWork = jest.fn().mockResolvedValue(OK);

      const first = await service.handle('k', BODY, doWork);
      expect(first.cacheHit).toBe(false);

      await jest.advanceTimersByTimeAsync(1001); // past TTL

      const second = await service.handle('k', BODY, doWork);
      expect(second.cacheHit).toBe(false); // fresh charge, not a replay
      expect(doWork).toHaveBeenCalledTimes(2);
    });

    it('replays before expiry and only re-charges after it', async () => {
      jest.useFakeTimers();
      const service = new IdempotencyService({ ttlMs: 1000 });
      const doWork = jest.fn().mockResolvedValue(OK);

      await service.handle('k', BODY, doWork);
      await jest.advanceTimersByTimeAsync(500); // still within TTL
      const replay = await service.handle('k', BODY, doWork);
      expect(replay.cacheHit).toBe(true);
      expect(doWork).toHaveBeenCalledTimes(1);
    });

    it('evicts expired records via the background sweep', async () => {
      jest.useFakeTimers();
      const service = new IdempotencyService({ ttlMs: 1000, sweepIntervalMs: 250 });
      service.onModuleInit();

      await service.handle('k', BODY, jest.fn().mockResolvedValue(OK));
      expect(service.size()).toBe(1);

      await jest.advanceTimersByTimeAsync(2000); // past TTL; sweeps fire
      expect(service.size()).toBe(0);

      service.onModuleDestroy();
    });

    it('never evicts an in-flight record (isEvictable interlock)', async () => {
      jest.useFakeTimers();
      const service = new IdempotencyService({ ttlMs: 1000, inFlightTimeoutMs: 60_000 });
      const d = deferred<StoredResponse>();
      const doWork = jest.fn(() => d.promise);

      const p1 = service.handle('k', BODY, doWork);
      await Promise.resolve(); // let it reserve

      await jest.advanceTimersByTimeAsync(2000); // past TTL, before the watchdog
      (service as any).sweep();
      expect(service.size()).toBe(1); // pinned while IN_FLIGHT
      expect(doWork).toHaveBeenCalledTimes(1);

      d.resolve(OK);
      await p1;
      (service as any).sweep();
      expect(service.size()).toBe(0); // now COMPLETED + expired -> evicted
    });

    it('isEvictable only allows settled records with no waiters', () => {
      const service = new IdempotencyService();
      const evictable = (rec: object) => (service as any).isEvictable(rec);

      expect(evictable({ state: 'COMPLETED', waiterCount: 0 })).toBe(true);
      expect(evictable({ state: 'COMPLETED', waiterCount: 1 })).toBe(false);
      expect(evictable({ state: 'IN_FLIGHT', waiterCount: 0 })).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('clears the sweep interval on destroy (no leaked timers)', () => {
      jest.useFakeTimers();
      const service = new IdempotencyService({ sweepIntervalMs: 100 });

      service.onModuleInit();
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      service.onModuleDestroy();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
