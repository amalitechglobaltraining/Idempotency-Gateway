# Idempotency Gateway Design

## Purpose

The service prevents a simulated payment from running more than once when a client retries the same request. It implements the original AmaliTech challenge and the concurrent in-flight bonus without adding production-only reconciliation features.

## Scope

The implementation supports two record states:

- `PROCESSING`: one request owns the payment operation and identical concurrent requests wait for it.
- `COMPLETED`: the exact status code and response body are stored and replayed.

`FAILED`, `INDETERMINATE`, webhooks, reconciliation, distributed locks, and external payment providers are outside the challenge scope. They will be described only as production improvements.

## Technology

- Node.js and TypeScript
- Express for HTTP routing
- Native `Map` objects for idempotency records and in-flight operations
- Node's `crypto` module for SHA-256 request fingerprints
- Vitest and Supertest for automated tests

The application must start with `npm start` after dependencies are installed. Development and test scripts will be documented in the README.

## Components

### HTTP Application

The Express application configures JSON parsing, exposes a health endpoint, mounts the payment route, and converts malformed JSON or unexpected errors into safe responses.

### Payment Route

`POST /process-payment` reads the `Idempotency-Key` header and request body, calls the payment service, and sends the returned status, headers, and body. The route does not contain storage or concurrency logic.

### Validation

Validation rejects:

- a missing, empty, non-string, or overly long idempotency key;
- a missing, non-numeric, zero, negative, or non-finite amount;
- a currency that is not exactly three uppercase letters.

Validation failures return `400 Bad Request` and do not create an idempotency record or execute the payment simulator.

### Request Fingerprinting

The request body is converted to a deterministic JSON representation by recursively sorting object keys. The canonical value is hashed with SHA-256.

This makes equivalent objects produce the same fingerprint regardless of property order. The fingerprint is used only to compare requests that share an idempotency key.

### Idempotency Repository

An in-memory repository stores one record per idempotency key. A record contains:

- idempotency key;
- request fingerprint;
- `PROCESSING` or `COMPLETED` status;
- original response status and body when completed;
- creation time;
- completion and expiration times when completed.

Creating a processing record is synchronous and atomic within one Node.js process. The first caller to insert a key becomes the owner. A later caller observes the existing record.

Completed records expire 24 hours after completion. Expiration is checked before a record is returned and can also be triggered through a cleanup method. Processing records never expire.

### In-Flight Registry

An in-flight registry maps an idempotency key to the Promise owned by the first request. Identical concurrent requests await that Promise instead of running another payment.

The entry is removed in a `finally` block when the original operation settles. This prevents completed operations from accumulating in memory. Waiting requests are released whether the operation succeeds or fails.

### Payment Simulator

The simulator waits two seconds and creates one success response containing a generated transaction ID, `SUCCESS` status, the charged amount, and currency.

The simulator is injected into the payment service so tests can use a controlled implementation without waiting two seconds.

### Payment Service

The payment service coordinates validation-independent business behavior:

1. Compute the request fingerprint.
2. Look up an existing record.
3. Return `409 Conflict` immediately if the fingerprint differs.
4. Replay a completed response with `X-Cache-Hit: true`.
5. Await the owner's Promise when an identical record is processing.
6. Claim a missing key and start one payment operation.
7. Store the exact successful response as completed.
8. Return the owner response with `X-Cache-Hit: false`.

The repository is checked again if a claim loses a race. This keeps the service correct even if the storage implementation later becomes asynchronous.

## HTTP Behaviour

### First Request

The first valid request returns `201 Created`, the generated payment response, and `X-Cache-Hit: false`.

### Completed Duplicate

An identical duplicate returns the exact original status code and response body with `X-Cache-Hit: true`. It does not run the simulator or wait two seconds.

### In-Flight Duplicate

An identical request arriving during processing waits for the owner. It receives the same status code and body with `X-Cache-Hit: true`. The simulator executes once.

### Payload Conflict

The same key with a different request fingerprint returns `409 Conflict` with:

```json
{
  "error": "Idempotency key already used for a different request body."
}
```

It does not wait for or execute payment processing.

### Unexpected Failure

Unexpected failures return `500 Internal Server Error` with a generic message. Internal stack traces and implementation details are never returned to the client.

## Testing

Automated tests cover:

- missing and invalid idempotency keys;
- invalid amount and currency values;
- malformed JSON;
- first-request status, body, and cache header;
- exact replay of completed responses;
- replay without another simulator call;
- conflicts for changed payloads;
- concurrent identical requests sharing one execution;
- an in-flight conflicting request returning immediately;
- canonical hashing independent of object key order;
- completed-record expiration;
- processing records remaining reserved;
- safe unexpected-error responses.

Tests use a fresh application and repository for isolation. Time and simulator dependencies are injected where deterministic control is needed.

## Documentation

The final README replaces the challenge brief and includes:

- the architecture diagram;
- setup and run instructions;
- API request and response examples;
- design decisions;
- the 24-hour safe-expiration feature;
- testing instructions;
- single-instance limitations and production improvements.

The supporting requirements, algorithm, state-machine, and data-structure documents will use the same two-state terminology.

## Git Delivery

Changes are committed on the existing `feat/idempotency-core` branch using the configured identity `Prudentkurler <sarkodiekurler@gmail.com>`. The branch is pushed to the user's GitHub repository after all checks pass.
