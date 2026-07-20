# Idempotency Record State Machine

The repository has two stored states:

```text
No record -> PROCESSING -> COMPLETED
```

The first valid caller creates `PROCESSING`. A successful payment replaces it with `COMPLETED` and a response snapshot.

## Request Behavior

| Existing record | Request hash | Behavior |
| --- | --- | --- |
| None | Any valid hash | Claim the key and start processing |
| `PROCESSING` | Same | Wait for the owner's Promise; replay its outcome |
| `PROCESSING` | Different | Return `409` immediately |
| `COMPLETED` | Same | Return the stored status and body |
| `COMPLETED` | Different | Return `409` |

## Expiration and Failure

`COMPLETED` expires exactly 24 hours after `completedAt`. Lookup removes an expired record lazily, while `deleteExpired()` supports bulk cleanup. `PROCESSING` never expires.

If payment processing throws, the gateway deletes the matching `PROCESSING` claim. The failure is shared with current waiters, and a later request may create a fresh claim. This is a return to no record, not an additional stored state.

## Invariants

- One key has at most one record in an application instance.
- Only the claim owner starts payment processing.
- Identical in-flight requests share the owner's operation.
- A completed replay preserves the stored status and body.
- A different request hash never replaces an existing record.
- Active processing is not removed by expiration cleanup.
