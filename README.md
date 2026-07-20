# Idempotency Gateway

A small payment API that prevents a retried request from running the same payment twice. It stores the result for each idempotency key and safely coordinates identical requests that arrive at the same time.

## Architecture

![Idempotency request flow](diagrams/algorithm.png)

Express validates the HTTP request, `PaymentService` fingerprints and coordinates it, and `InMemoryIdempotencyRepository` stores the claim or completed response. A payment simulator stands in for a downstream provider.

## How It Works

- **First request:** the gateway claims the key, marks it `PROCESSING`, runs the payment simulator, stores an immutable response snapshot, and returns `201` with `X-Cache-Hit: false`.
- **Completed duplicate:** the same key and payment body receive the stored status and body with `X-Cache-Hit: true`. The simulator does not run again.
- **In-flight duplicate:** an identical request waits on the first request's Promise, then receives the same result with `X-Cache-Hit: true`.
- **Same-key conflict:** reusing a key with a different payment body returns `409` immediately, whether the original request is processing or completed.

See [the algorithm](docs/algorithm.md), [state machine](docs/statemachine.md), [requirements](docs/requirements.md), and [data structures](docs/data-structures.md) for more detail.

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

The request needs exactly one `Idempotency-Key` header. Its raw value may be at most 255 characters and must not be blank after trimming. `amount` must be a finite positive number, and `currency` must be exactly three uppercase letters.

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

Reusing a key with a different valid body returns `409 Conflict`:

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

- Request bodies are canonicalized by recursively sorting object keys, then hashed with SHA-256. Equivalent object key orders therefore share a fingerprint.
- A synchronous `Map` check-and-set claims each new key before asynchronous work begins.
- An in-flight `Promise` lets identical concurrent requests share one operation and outcome.
- Stored records and returned bodies use `structuredClone`, so callers cannot mutate shared or cached data.
- If processing throws, the matching `PROCESSING` claim is released. Waiting duplicates see the same error, and a later request may retry.
- Coordination is limited to one app instance because both maps live in one Node.js process.

## Developer's Choice: Safe Expiration

A completed record expires exactly 24 hours after `completedAt`. `PROCESSING` records never expire because removing an active claim could allow the same payment to start again. Expired completed records are removed lazily when read, and the repository also provides bulk cleanup for a scheduled maintenance job.

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
docs/                             requirements and design notes
diagrams/algorithm.png            request-flow diagram
```

## Production Improvements

- Store records in a persistent database with a unique index on the scoped idempotency key.
- Use distributed coordination so multiple gateway instances share ownership and results.
- Pass idempotency keys to the payment provider and reconcile uncertain downstream outcomes.
- Add authentication and scope keys by client or account.
- Add audit records, structured observability, and rate limits.
