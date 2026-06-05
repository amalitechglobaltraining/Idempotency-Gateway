import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { fingerprint } from './body-fingerprint.util';
import {
  CONFLICT_STATUS,
  IN_FLIGHT_TIMEOUT_MS,
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
  private readonly inFlightTimeoutMs = IN_FLIGHT_TIMEOUT_MS;
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
      // Guard the shared promise so a failure with ZERO waiters can never surface
      // as an unhandledRejection (which would crash the process / fail tests).
      // Real waiters still receive the rejection through their own await.
      inFlightPromise.catch(() => undefined);

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

      try {
        const stored = await this.runWithWatchdog(doWork);
        fresh.state = RecordState.COMPLETED;
        fresh.response = stored;
        fresh.completedAt = Date.now();
        resolveOuter(stored);
        return { response: stored, cacheHit: false };
      } catch (err) {
        // Never cache a failure as a success. Reject the shared promise so every
        // parked waiter fails together, then DELETE the key so a retry runs fresh
        // (at-least-once on failure, exactly-once on success).
        fresh.state = RecordState.FAILED;
        fresh.error = { message: this.errorMessage(err) };
        rejectOuter(err);
        this.store.delete(key);
        throw err;
      } finally {
        fresh.inFlightPromise = null;
      }
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

  /**
   * Run the charge but reject if it exceeds IN_FLIGHT_TIMEOUT_MS. Because an
   * IN_FLIGHT record is never evicted by TTL, a hung charge would otherwise pin
   * its key forever; the watchdog turns that into a normal failure (key freed,
   * 500 returned, retryable). The timer is unref'd and always cleared on settle.
   */
  private runWithWatchdog(
    doWork: () => Promise<StoredResponse>,
  ): Promise<StoredResponse> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Charge exceeded IN_FLIGHT_TIMEOUT_MS (${this.inFlightTimeoutMs}ms)`,
            ),
          ),
        this.inFlightTimeoutMs,
      );
      timer.unref();
    });
    return Promise.race([doWork(), timeout]).finally(() => clearTimeout(timer));
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
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
