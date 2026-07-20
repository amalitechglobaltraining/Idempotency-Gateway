# Idempotency Gateway Requirements

## HTTP Interface

`GET /health` must return `200` with `{"status":"ok"}`.

`POST /process-payment` must accept JSON and exactly one `Idempotency-Key` header. The raw header value must be no longer than 255 characters and must contain a non-whitespace value after trimming.

The payment body must be a JSON object containing:

- `amount`: a finite number greater than zero;
- `currency`: exactly three uppercase letters.

Invalid headers or payment bodies must return `400` with the corresponding safe error message. Validation failures must not execute payment processing.

## Successful Processing and Replay

A valid request with a new key must:

1. create a canonical fingerprint of the validated payment;
2. synchronously claim the key as `PROCESSING`;
3. execute the payment once;
4. store the exact `201` response status and an immutable response-body snapshot as `COMPLETED`;
5. return `201` with `X-Cache-Hit: false`.

An identical duplicate of a `COMPLETED` request must skip processing and return the stored status and body with `X-Cache-Hit: true`.

An identical duplicate of a `PROCESSING` request must wait for the owner's in-flight operation. It must receive the same status and body with `X-Cache-Hit: true`, without starting another payment.

Reusing a key with a different fingerprint must return `409`, `X-Cache-Hit: false`, and:

```json
{"error":"Idempotency key already used for a different request body."}
```

An in-flight conflict must return immediately rather than waiting for the owner.

## Error Handling

- Malformed JSON must return `400` and `{"error":"Request body must be valid JSON."}`.
- JSON over 100 KB must return `413` and `{"error":"Request body is too large."}`.
- Unexpected errors must return `500` and `{"error":"An unexpected error occurred."}` without exposing internal details.
- If the owned operation fails, its matching claim must be released. Identical waiters receive the same failure, and a later request may retry.
- Parsing, size, validation, and unexpected-error responses do not carry `X-Cache-Hit`.

## Record Lifecycle and Expiration

The only stored states are `PROCESSING` and `COMPLETED`.

```text
No record -> PROCESSING -> COMPLETED
```

A failed operation removes its `PROCESSING` claim rather than creating another state. `PROCESSING` records do not expire. A `COMPLETED` record expires exactly 24 hours after completion and may be removed lazily on lookup or through bulk cleanup.

Storage and coordination are in memory. Guarantees apply only within one application instance and reset on restart.

## Acceptance Tests

The automated suite must verify:

- health, header, body, malformed JSON, and 100 KB boundary behavior;
- `201` first responses and exact completed replays;
- cache headers for owners, waiters, replays, and conflicts;
- one execution for concurrent identical requests;
- immediate conflicts for different bodies, both in flight and completed;
- canonical fingerprints for reordered object keys;
- failure claim release and successful retry;
- immutable stored and returned snapshots;
- expiration exactly 24 hours after completion while active records remain;
- safe unexpected errors and server lifecycle behavior.
