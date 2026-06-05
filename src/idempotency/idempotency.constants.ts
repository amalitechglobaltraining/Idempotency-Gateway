/**
 * Central tunables. Every timing is env-overridable so ops can tune per
 * environment and tests can shrink windows without touching code.
 */

/** How long an idempotency key stays valid, from first use (Stripe-style fixed window). Default 24h. */
export const TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS ?? 24 * 60 * 60 * 1000);

/** How often the background sweep evicts expired records. Memory hygiene only. Default 60s. */
export const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 60_000);

/** Upper bound on how long a charge may stay IN_FLIGHT before the watchdog frees the key. Default 30s. */
export const IN_FLIGHT_TIMEOUT_MS = Number(process.env.IN_FLIGHT_TIMEOUT_MS ?? 30_000);

/** Max accepted Idempotency-Key length — caps Map-growth abuse via huge keys. */
export const MAX_KEY_LEN = 255;

/** Status code for the "same key, different body" conflict. Flip to 422 here if preferred. */
export const CONFLICT_STATUS = 409;

/**
 * Whether an in-flight waiter (request B that blocked on request A) also receives
 * `X-Cache-Hit: true`. Default true — B did no processing of its own. A COMPLETED
 * replay always gets the header regardless of this toggle.
 */
export const EMIT_INFLIGHT_CACHE_HIT = true;
