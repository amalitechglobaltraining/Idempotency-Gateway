/** Lifecycle of a single idempotency key. */
export enum RecordState {
  IN_FLIGHT = 'IN_FLIGHT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/** The response we persist on first success and replay byte-for-byte on duplicates. */
export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

/** One entry in the in-memory store, keyed by the (trimmed) Idempotency-Key. */
export interface IdempotencyRecord {
  /** The trimmed Idempotency-Key — also the Map key; kept for sweeps/debugging. */
  key: string;
  state: RecordState;
  /** sha256(canonicalize(validatedDto)) — used to detect same vs different body. */
  requestFingerprint: string;
  /** Date.now() at reservation — the SOLE basis for TTL (fixed window). */
  createdAt: number;
  /** Date.now() when the record settled (observability). */
  completedAt: number | null;
  /** SHARED promise; non-null only while IN_FLIGHT; concurrent requests await it. */
  inFlightPromise: Promise<StoredResponse> | null;
  /** Number of parked waiters (excludes the originator); pins the record vs eviction. */
  waiterCount: number;
  /** Present only when COMPLETED. */
  response: StoredResponse | null;
  /** Present only when FAILED (observability; never replayed as a success). */
  error: { message: string } | null;
}

/** What IdempotencyService.handle returns; the controller maps it to HTTP. */
export interface HandleResult {
  response: StoredResponse;
  /** false for the originator; true for replays AND in-flight waiters. */
  cacheHit: boolean;
}
