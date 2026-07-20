# Idempotency Algorithm

This flow ensures that retries share one payment execution while key reuse with a different validated payment is rejected.

![Validated payment branches to conflict, replay, wait, or new processing](../diagrams/algorithm.png)

*Successful and duplicate-request flow. In the diagram, "request body" means the validated payment fields `{ amount, currency }`; extra JSON properties are ignored.*

The diagram does not show processing failure: the matching claim is released, the owner and current waiters receive the error, and a later retry can claim the key.

1. Parse JSON and validate the single `Idempotency-Key`, positive finite `amount`, and three-letter uppercase `currency`. Extract `{ amount, currency }` and ignore extra JSON properties.
2. Canonicalize that validated payment by recursively sorting object keys, then compute its SHA-256 hash.
3. Look up the key. A hash representing a different validated amount or currency returns `409`; a matching `COMPLETED` record replays its snapshot; a matching `PROCESSING` record waits for its in-flight Promise.
4. If no record exists, synchronously claim the key by inserting a `PROCESSING` record. If another caller won the claim, handle its record using step 3.
5. Publish the owner's Promise before yielding, then run the payment simulator.
6. On success, clone the response, store its `201` status and body snapshot, and replace the record with `COMPLETED`.
7. Resolve the owner with `X-Cache-Hit: false`; identical waiters receive isolated copies with `X-Cache-Hit: true`.
8. On failure, release only the matching `PROCESSING` claim, reject the owner and waiters, and allow a later request to retry.
