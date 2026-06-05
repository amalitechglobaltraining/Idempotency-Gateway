import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { fingerprint } from './body-fingerprint.util';
import {
  CONFLICT_STATUS,
  SWEEP_INTERVAL_MS,
  TTL_MS,
} from './idempotency.constants';
import {
  HandleResult,
  IdempotencyRecord,
  RecordState,
  StoredResponse,
} from './idempotency.types';

const CONFLICT_MESSAGE =
  'Idempotency key already used for a different request body.';

/**
 * The heart of the gateway. A single in-memory Map keyed by the (trimmed)
 * Idempotency-Key holds one record per key. `handle()` decides, from the record
 * state, whether to run the work once, replay a stored response, block on an
 * in-flight charge, or reject a conflicting body.
 *
 * Keys expire on a fixed window from first use (Stripe-style). Expiry is enforced
 * lazily on read (authoritative) and by a background sweep (memory hygiene only).
 */
@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private readonly store = new Map<string, IdempotencyRecord>();
  private readonly ttlMs = TTL_MS;
  private readonly sweepIntervalMs = SWEEP_INTERVAL_MS;
  private sweepTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    // Never keep the process (or a Jest run) alive just for the sweep.
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

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
    let record = this.store.get(key);

    // Lazy TTL (authoritative): an expired, evictable record is dropped here so
    // the same key behaves as brand new. We never evict a record that is still
    // IN_FLIGHT or has parked waiters (see isEvictable) — that would risk a
    // double-charge or stranding a waiter.
    if (
      record !== undefined &&
      this.isExpired(record) &&
      this.isEvictable(record)
    ) {
      this.store.delete(key);
      record = undefined;
    }

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
      // rejectOuter is unused on the happy path; the failure path is added next.
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
    // can never evict a record that still has parked waiters.
    const inFlight = record.inFlightPromise!;
    record.waiterCount++;
    try {
      const stored = await inFlight;
      return { response: stored, cacheHit: true };
    } finally {
      record.waiterCount--;
    }
  }

  /** A key is expired TTL_MS after it was first reserved (fixed window, no sliding). */
  private isExpired(rec: IdempotencyRecord): boolean {
    return Date.now() - rec.createdAt >= this.ttlMs;
  }

  /** Only settled records with no parked waiters may be evicted by TTL. */
  private isEvictable(rec: IdempotencyRecord): boolean {
    return rec.state !== RecordState.IN_FLIGHT && rec.waiterCount === 0;
  }

  /** Background memory hygiene; correctness never depends on it running on time. */
  private sweep(): void {
    for (const [key, rec] of this.store) {
      if (this.isExpired(rec) && this.isEvictable(rec)) {
        this.store.delete(key);
      }
    }
  }

  /** Test/diagnostic helper: current number of stored keys. */
  size(): number {
    return this.store.size;
  }
}
