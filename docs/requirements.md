# Idempotency Gateway Requirements

## 1. Purpose

The system must prevent a simulated payment from being processed more than once when a client retries the same request.

Multiple HTTP requests may be received, but requests representing the same payment attempt must produce only one payment execution.

---

## 2. API Endpoint

### Process Payment

```http
POST /process-payment
```

The endpoint accepts a payment request and an idempotency key.

### Required Header

```http
Idempotency-Key: <unique-string>
```

The request must be rejected when the header is:

* missing;
* empty;
* not a string;
* excessively long.

### Request Body

```json
{
  "amount": 100,
  "currency": "GHS"
}
```

Validation rules:

* `amount` is required;
* `amount` must be a positive number;
* `currency` is required;
* `currency` must be a three-letter uppercase string.

---

## 3. First Request

Given an idempotency key that has never been used:

1. Validate the header and body.
2. Create a deterministic fingerprint of the request body.
3. Claim the idempotency key.
4. Save the request state as `PROCESSING`.
5. Simulate payment processing with a two-second delay.
6. Generate a payment response.
7. Save the exact response body and HTTP status code.
8. Change the request state to `COMPLETED`.
9. Return the response to the client.

Expected response:

```http
HTTP/1.1 201 Created
X-Cache-Hit: false
Content-Type: application/json
```

Example body:

```json
{
  "transactionId": "generated-transaction-id",
  "status": "SUCCESS",
  "message": "Charged 100 GHS",
  "amount": 100,
  "currency": "GHS"
}
```

---

## 4. Completed Duplicate Request

Given:

* the same idempotency key;
* the same request fingerprint;
* an existing `COMPLETED` record;

the system must:

1. Skip payment processing.
2. Skip the two-second delay.
3. Return the exact stored response body.
4. Return the exact stored HTTP status code.
5. Include the replay header:

```http
X-Cache-Hit: true
```

The duplicate request must not generate a new transaction ID.

---

## 5. Same Key With a Different Request Body

Given:

* an existing idempotency key;
* a request fingerprint different from the stored fingerprint;

the system must reject the request.

Expected response:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

Expected body:

```json
{
  "error": "Idempotency key already used for a different request body."
}
```

The payment processing function must not run.

---

## 6. Concurrent In-Flight Duplicate

Given two identical requests arriving almost simultaneously:

* Request A and Request B use the same idempotency key;
* both requests have the same request fingerprint;
* Request A claims the key first;

the system must:

1. Allow Request A to start payment processing.
2. Store the key as `PROCESSING`.
3. Prevent Request B from starting another payment process.
4. Make Request B wait for Request A.
5. Return Request A's final response to both requests.
6. Execute the payment processing function only once.
7. Return `X-Cache-Hit: true` for Request B.

Request B must not receive `409 Conflict`.

---

## 7. Concurrent Request With a Different Body

Given:

* Request A is processing;
* Request B uses the same idempotency key;
* Request B has a different request fingerprint;

Request B must immediately receive `409 Conflict`.

It must not wait for Request A and must not execute payment processing.

---

## 8. Processing States

Each idempotency record has a processing state that describes whether the payment outcome is known.

### `PROCESSING`

The idempotency key has been claimed and the payment operation is currently running.

Identical requests arriving during this state must wait for the original operation.

A `PROCESSING` record must not be deleted because the payment may already have been submitted.

### `COMPLETED`

The payment operation finished successfully.

The exact response body and HTTP status code are stored and replayed for identical duplicate requests.

### `FAILED`

The payment operation reached a definite failure.

Examples include a confirmed decline or a conclusive processing error.

The exact failure response is stored and replayed for identical duplicate requests.

### `INDETERMINATE`

The gateway submitted the payment operation but could not determine whether it succeeded or failed.

This may occur when the downstream response is lost or times out after the payment request has already been sent.

An `INDETERMINATE` request must not be processed again automatically.

Identical retries receive a pending response while reconciliation attempts to determine the final result.

---

## 9. State Transitions

```text
PROCESSING ── definite success ──> COMPLETED
     │
     ├── definite failure ───────> FAILED
     │
     └── uncertain outcome ──────> INDETERMINATE
                                      │
                                      ├── confirmed success ──> COMPLETED
                                      └── confirmed failure ──> FAILED
```

Only `COMPLETED` and `FAILED` are terminal states.

`PROCESSING` and `INDETERMINATE` are non-terminal states and must continue reserving the idempotency key.

---

## 10. Processing Timeout

A processing timeout is different from idempotency-key expiration.

Each newly claimed record receives a `processingDeadline`.

```text
processingDeadline = createdAt + configured processing timeout
```

If processing finishes before the deadline, the record becomes `COMPLETED` or `FAILED`.

If the deadline passes after the payment operation has been submitted but no conclusive result is available, the record becomes `INDETERMINATE`.

The record must not be deleted when the processing deadline passes.

---

## 11. Reconciliation

An `INDETERMINATE` record requires reconciliation.

The reconciliation process uses the stored payment-attempt reference to query the simulated payment processor for the final result.

Possible outcomes:

```text
Confirmed success → COMPLETED

Confirmed failure → FAILED

Still unresolved → remain INDETERMINATE
```

While reconciliation is pending:

* the idempotency key remains reserved;
* identical retries must not initiate another payment;
* conflicting request bodies must still return `409 Conflict`;
* the API may return `202 Accepted`;
* the response should explain that the result is being verified.

Example response:

```http
HTTP/1.1 202 Accepted
Retry-After: 5
```

```json
{
  "status": "INDETERMINATE",
  "message": "The payment outcome is being reconciled."
}
```

---

## 12. Developer’s Choice: Safe Key Expiration

Idempotency records must not remain in active storage forever.

A 24-hour retention period will be applied only after a record reaches a terminal state.

The expiration clock begins when the record becomes:

* `COMPLETED`; or
* `FAILED`.

Example:

```text
terminalAt = time final outcome became known

expiresAt = terminalAt + 24 hours
```

A record in `PROCESSING` or `INDETERMINATE` must not expire because its outcome is unresolved.

Deleting an unresolved record could allow a duplicate request to be treated as a new payment and cause double charging.

The expiration rules are therefore:

```text
PROCESSING:
    do not expire
    apply processing deadline

INDETERMINATE:
    do not expire
    continue reconciliation

COMPLETED:
    expire 24 hours after completion

FAILED:
    expire 24 hours after definite failure
```

Expired terminal records are eligible for cleanup.

---

## 13. Stored Idempotency Record

Each record must contain:

```text
idempotencyKey
paymentAttemptId
requestHash
processingStatus
responseStatus
responseBody
processingDeadline
reconciliationAttempts
lastReconciliationAt
terminalAt
createdAt
updatedAt
expiresAt
```

The idempotency key must remain uniquely constrained throughout the active and retention periods.

---

## 14. Request Fingerprinting

The system must not compare raw JSON strings directly.

The request body must first be converted into a deterministic representation by recursively sorting object keys.

The canonical representation will then be hashed.

The fingerprint is used to distinguish:

```text
Same key + same fingerprint = retry

Same key + different fingerprint = conflict
```

The fingerprint must not be used as the idempotency key because separate legitimate payments can have identical bodies.

---
## 15. Validation Errors

The API must reject:

* missing idempotency keys;
* empty idempotency keys;
* invalid payment bodies;
* zero or negative amounts;
* missing currencies;
* invalid currency formats;
* malformed JSON.

Validation failures must not execute the payment simulation.

---

## 16. Error Safety

Internal technical details must not be exposed in API responses.

Unexpected application errors must return a safe server response.

Waiting in-flight requests must be released when the original request succeeds or fails.

No request should wait forever.

---

## 17. Testing Requirements

The automated test suite must verify:

1. Missing idempotency key returns `400`.
2. Invalid payment data returns `400`.
3. A first request returns `201`.
4. A first request executes the payment simulation once.
5. A completed duplicate returns the same body.
6. A completed duplicate returns the same status code.
7. A completed duplicate contains `X-Cache-Hit: true`.
8. A completed duplicate skips the two-second delay.
9. The same key with a different body returns `409`.
10. Two simultaneous identical requests execute the payment once.
11. Both simultaneous requests receive the same result.
12. An in-flight request with a different body returns `409`.
13. Expiration behaviour works as documented.

---

## 18. Scope Limitations

This challenge simulates payment processing locally.

The implementation does not provide true end-to-end exactly-once guarantees across an external bank or payment provider.

A production version would additionally require:

* downstream idempotency support;
* payment-status reconciliation;
* signed webhooks;
* audit trails;
* authentication and client-level key scoping;
* distributed coordination for multiple application instances;
* monitoring and structured operational logging.
