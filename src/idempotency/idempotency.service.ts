import { HttpException, Injectable } from '@nestjs/common';
import { fingerprint } from './body-fingerprint.util';
import { CONFLICT_STATUS } from './idempotency.constants';

const CONFLICT_MESSAGE =
  'Idempotency key already used for a different request body.';
import {
  HandleResult,
  IdempotencyRecord,
  RecordState,
  StoredResponse,
} from './idempotency.types';

/**
 * The heart of the gateway. A single in-memory Map keyed by the (trimmed)
 * Idempotency-Key holds one record per key. `handle()` decides, from the record
 * state, whether to run the work once, replay a stored response, or (added in
 * later commits) block on an in-flight charge / reject a conflicting body.
 */
@Injectable()
export class IdempotencyService {
  private readonly store = new Map<string, IdempotencyRecord>();

  /**
   * @param key    the validated, trimmed Idempotency-Key
   * @param body   the validated ProcessPaymentDto (fingerprinted for body comparison)
   * @param doWork closure that performs the real charge; invoked at most once per key
   */
  async handle(
    key: string,
    body: unknown,
    doWork: () => Promise<StoredResponse>,
  ): Promise<HandleResult> {
    const fp = fingerprint(body);

    // ---- BEGIN SYNCHRONOUS CRITICAL SECTION (no await until store.set) ----
    // On Node's single-threaded event loop this get -> decide -> set runs to
    // completion with no interleaving, so two concurrent requests for the same
    // new key can never both reserve it. Do NOT introduce an await in here.
    const record = this.store.get(key);

    if (record === undefined) {
      let resolveOuter!: (value: StoredResponse) => void;
      let rejectOuter!: (reason: unknown) => void;
      const inFlightPromise = new Promise<StoredResponse>((resolve, reject) => {
        resolveOuter = resolve;
        rejectOuter = reject;
      });

      const fresh: IdempotencyRecord = {
        key,
        state: RecordState.IN_FLIGHT,
        requestFingerprint: fp,
        createdAt: Date.now(),
        completedAt: null,
        inFlightPromise,
        waiterCount: 0,
        response: null,
        error: null,
      };
      this.store.set(key, fresh);
      // ---- END CRITICAL SECTION ----

      const stored = await doWork();
      fresh.state = RecordState.COMPLETED;
      fresh.response = stored;
      fresh.completedAt = Date.now();
      resolveOuter(stored);
      fresh.inFlightPromise = null;
      // rejectOuter is unused on the happy path; the failure path is added later.
      void rejectOuter;
      return { response: stored, cacheHit: false };
    }

    // A record already exists for this key.
    // Same key but a DIFFERENT body is a misuse (or a fraud/error signal) — reject
    // it rather than replaying someone else's charge. Synchronous, no waiting.
    if (record.requestFingerprint !== fp) {
      throw new HttpException(CONFLICT_MESSAGE, CONFLICT_STATUS);
    }

    if (record.state === RecordState.COMPLETED) {
      // Duplicate of a finished request: replay the saved response, no work.
      return { response: record.response as StoredResponse, cacheHit: true };
    }

    // Still IN_FLIGHT (a concurrent duplicate): block on the originator's shared
    // promise and replay its result once it settles — no second charge, no 409.
    // We capture the promise synchronously and bump waiterCount so the TTL sweep
    // (added next) can never evict a record that still has parked waiters.
    const inFlight = record.inFlightPromise!;
    record.waiterCount++;
    try {
      const stored = await inFlight;
      return { response: stored, cacheHit: true };
    } finally {
      record.waiterCount--;
    }
  }
}
