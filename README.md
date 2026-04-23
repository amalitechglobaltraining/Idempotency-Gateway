# Idempotency Gateway — FinSafe Transactions Ltd.

A RESTful idempotency layer that ensures payment requests are processed **exactly once**, regardless of retries.

---

## Architectural Diagram (Flow Chart)
<img width="1569" height="2447" alt="Idempotency" src="https://github.com/user-attachments/assets/322b8b44-6b63-4a91-bc3b-6fd228846177" />

---

**In-flight race condition (Bonus):**
---
<img width="1485" height="526" alt="waiters" src="https://github.com/user-attachments/assets/2c003194-4830-4f9f-8ef5-ee1b04f2d768" />


---

## Setup Instructions

```bash
git clone https://github.com/Glocks99/idempotency-gateway
cd idempotency-gateway
npm install
npm start
```

Server runs at `http://localhost:3000`.

For development with auto-restart:
```bash
npm run dev
```

---

## API Documentation

### `POST /process-payment`

**Headers**

| Header            | Required | Description                        |
|-------------------|----------|------------------------------------|
| `idempotency-key` |  Yes     | Unique string per payment attempt  |
| `Content-Type`    |  Yes     | `application/json`                 |

**Request Body**

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | Number | Yes | The payment amount. Must be a positive number |
| `currency` | String | Yes | Currency code. Must be a non-empty string |

```json
{
  "amount": 100,
  "currency": "GHS"
}
```

---

### Scenario 1 — First request (Happy Path)

```bash
curl -X POST http://localhost:3000/process-payment \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-abc-123" \
  -d '{"amount": 100, "currency": "GHS"}'
```

**Response `201 Created`**
```json
{
  "status": "success",
  "message": "Charged 100 GHS",
  "transactionId": "txn_1718000000000",
}
```

---

### Scenario 2 — Duplicate request (same key, same body)

```bash
curl -X POST http://localhost:3000/process-payment \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-abc-123" \
  -d '{"amount": 100, "currency": "GHS"}'
```

**Response `201 Created`** (instant, no 2s delay)

**Response Header:**

```http
X-Cache-Hit: true
```

**Response Body:**
```json
{
  "status": "success",
  "message": "Charged 100 GHS",
  "transactionId": "txn_1718000000000"
}
```

**Response Header:**
---

### Scenario 3 — Same key, different body (fraud/error check)

```bash
curl -X POST http://localhost:3000/process-payment \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-abc-123" \
  -d '{"amount": 500, "currency": "GHS"}'
```

**Response `422 Unprocessable Entity`**

```json
{
  "error": "Idempotency key already used for a different request body."
}
```

---

### Scenario 4 — Missing header

**Response `400 Bad Request`**
```json
{
  "error": "Missing required header: Idempotency-Key"
}
```

---

## Design Decisions

**In-memory store with TTL:** Keys expire after 24 hours, matching Stripe's idempotency key lifetime. Easy to swap for Redis.

**Body hashing (SHA-256):** Rather than comparing raw bodies, we hash and compare — efficient and tamper-evident. Keys are sorted so `{amount, currency}` and `{currency, amount}` are treated identically.

**Waiter queue for in-flight requests:** Concurrent identical requests don't spawn duplicate processes. The second request registers a callback and awaits the first request's completion, then returns the same result with `X-Cache-Hit: true`.

**Response interception:** We wrap `res.json` to capture the response before it's sent, storing it for future replays. This keeps the payment route unaware of the caching layer.

---

## Developer's Choice: Rate Limiting for Payment Protection

**What I added:**  
I added rate limiting to the `/process-payment` endpoint using `express-rate-limit`.

The API allows a maximum of **10 payment requests per minute** from the same client. If the limit is exceeded, the server returns:

```json
{
  "error": "Too many payment requests, please slow down"
}
```

---

**Why it matters in Fintech:**  
Even with idempotency protection in place, a payment endpoint is still vulnerable to abuse if clients can send unlimited requests in a short period of time.

Without rate limiting, this could lead to:

- accidental request flooding from buggy clients,
- denial-of-service behavior from malicious users,
- excessive strain on backend payment infrastructure,
- increased fraud risk through rapid repeated payment attempts.

Adding rate limiting protects the payment service by controlling how frequently requests can be made from a client within a fixed time window.

This improves system stability and introduces a basic abuse-prevention mechanism, which is especially important in financial systems where endpoints must be resilient against misuse.