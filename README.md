# Idempotency Gateway

A small payment API that prevents a retried request from running the same payment twice. It stores the result for each idempotency key and safely coordinates identical requests that arrive at the same time.

## Architecture

![Validated payment branches to conflict, replay, wait, or new processing](diagrams/algorithm.png)

*Successful and duplicate-request flow. In the diagram, "request body" means the validated payment fields `{ amount, currency }`; extra JSON properties are ignored.*

Express validates the HTTP request, `PaymentService` fingerprints and coordinates it, and `InMemoryIdempotencyRepository` stores the claim or completed response. A payment simulator stands in for a downstream provider.

If processing fails, the gateway releases the matching claim, returns the error to the owner and current waiters, and lets a later retry claim the key.

## How It Works

- **First request:** the gateway claims the key, marks it `PROCESSING`, runs the payment simulator, stores an immutable response snapshot, and returns `201` with `X-Cache-Hit: false`.
- **Completed duplicate:** the same key and validated payment receive the stored status and body with `X-Cache-Hit: true`. The simulator does not run again.
- **In-flight duplicate:** an identical request waits on the first request's Promise, then receives the same result with `X-Cache-Hit: true`.
- **Same-key conflict:** reusing a key with a different validated amount or currency returns `409` immediately, whether the original request is processing or completed.

See [the algorithm](docs/algorithm.md), [state machine](docs/statemachine.md), [use-case diagram](docs/use-case-diagram.md), [sequence diagrams](docs/sequence-diagrams.md), [requirements](docs/requirements.md), and [data structures](docs/data-structures.md) for more detail.

## Setup

Prerequisite: Node.js 20 or newer.

```bash
npm ci
npm run build
npm start
```

The server listens on port `3000` by default. Set `PORT` to use another port:

```bash
PORT=8080 npm start
```

PowerShell equivalent:

```powershell
$env:PORT = '8080'
npm start
```

All idempotency data is held in memory and resets when the process restarts.

## API

### `GET /health`

Returns `200 OK`:

```json
{"status":"ok"}
```

### `POST /process-payment`

The request needs exactly one `Idempotency-Key` header. Its raw value may be at most 255 characters and must not be blank after trimming. `amount` must be a finite positive number, and `currency` must be exactly three uppercase letters. Validation extracts only these two payment fields, so extra JSON properties are ignored for processing and idempotency comparison.

```bash
curl -i http://localhost:3000/process-payment \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-001" \
  -d '{"amount":100,"currency":"GHS"}'
```

The first valid request returns `201 Created` after the simulated two-second operation:

```http
HTTP/1.1 201 Created
X-Cache-Hit: false
Content-Type: application/json; charset=utf-8

{"transactionId":"<generated UUID>","status":"SUCCESS","message":"Charged 100 GHS","amount":100,"currency":"GHS"}
```

Sending the same key and body again returns the same `201` response, including the original transaction ID:

```http
HTTP/1.1 201 Created
X-Cache-Hit: true
Content-Type: application/json; charset=utf-8

{"transactionId":"<same UUID>","status":"SUCCESS","message":"Charged 100 GHS","amount":100,"currency":"GHS"}
```

Invalid headers or payment bodies return `400 Bad Request`. For example, a missing key returns:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{"error":"A valid Idempotency-Key header is required."}
```

An invalid payment body returns:

```json
{"error":"A valid payment with amount and currency is required."}
```

Malformed JSON also returns `400`:

```json
{"error":"Request body must be valid JSON."}
```

Reusing a key with a different validated amount or currency returns `409 Conflict`:

```http
HTTP/1.1 409 Conflict
X-Cache-Hit: false
Content-Type: application/json; charset=utf-8

{"error":"Idempotency key already used for a different request body."}
```

JSON larger than 100 KB returns `413 Payload Too Large`:

```http
HTTP/1.1 413 Payload Too Large
Content-Type: application/json; charset=utf-8

{"error":"Request body is too large."}
```

Unexpected processing errors are hidden behind a generic `500 Internal Server Error` response:

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json; charset=utf-8

{"error":"An unexpected error occurred."}
```

Validation, parsing, size, and unexpected-error responses do not include `X-Cache-Hit`.

## Design Decisions

- Validation extracts `{ amount, currency }` from the JSON body. That validated payment is canonicalized by recursively sorting object keys and hashed with SHA-256; extra JSON properties do not affect the fingerprint.
- A synchronous `Map` check-and-set claims each new key before asynchronous work begins.
- An in-flight `Promise` lets identical concurrent requests share one operation and outcome.
- Stored records and returned bodies use `structuredClone`, so callers cannot mutate shared or cached data.
- If processing throws, the matching `PROCESSING` claim is released. Waiting duplicates see the same error, and a later request may retry.
- Coordination is limited to one app instance because both maps live in one Node.js process.

## Developer's Choice: Safe Expiration

A completed record expires exactly 24 hours after `completedAt`. `PROCESSING` records never expire because removing an active claim could allow the same payment to start again. A lookup for that key, including the lookup performed while claiming it, removes an expired completed record and treats the key as absent. The repository exposes `deleteExpired()` as an unwired maintenance hook; no scheduler calls it today, so an untouched expired record can remain physically in memory until a lookup, a future manual cleanup hook, or process restart.

## Testing

```bash
npm test
npm run typecheck
npm run build
```

The tests cover request validation, error boundaries, canonical hashing, concurrent duplicates and conflicts, immutable snapshots, failure retry behavior, expiration boundaries, and server lifecycle behavior.

## Project Structure

```text
src/app.ts                         HTTP routes and error handling
src/domain/                       request fingerprints and shared types
src/services/                     idempotency coordination and payment simulation
src/storage/                      in-memory idempotency repository
test/                             automated tests
docs/                             requirements, design notes, and editable Mermaid sources
diagrams/                         rendered algorithm, use-case, and sequence diagrams
```

## Production Improvements

- Store records in a persistent database with a unique index on the scoped idempotency key.
- Use distributed coordination so multiple gateway instances share ownership and results.
- Pass idempotency keys to the payment provider and reconcile uncertain downstream outcomes.
- Add authentication and scope keys by client or account.
- Add audit records, structured observability, and rate limits.
