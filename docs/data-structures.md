# Data Structures

## API Values

```ts
interface PaymentRequest {
  amount: number;
  currency: string;
}

interface PaymentResponse {
  transactionId: string;
  status: 'SUCCESS';
  message: string;
  amount: number;
  currency: string;
}
```

## Idempotency Records

```ts
interface ProcessingRecord {
  idempotencyKey: string;
  requestHash: string;
  status: 'PROCESSING';
  createdAt: number;
}

interface CompletedRecord {
  idempotencyKey: string;
  requestHash: string;
  status: 'COMPLETED';
  responseStatus: number;
  responseBody: unknown;
  createdAt: number;
  completedAt: number;
  expiresAt: number;
}
```

`InMemoryIdempotencyRepository` stores these records in a `Map<string, IdempotencyRecord>` keyed by `idempotencyKey`. Lookup, claim, completion, and release are average `O(1)` operations. Bulk expiration scans all records in `O(n)` time.

`PaymentService` keeps a separate `Map<string, Promise<OperationResult>>` for currently owned operations. Identical concurrent callers await the same Promise, but each receives a cloned result body.

Completed bodies are cloned when stored and when returned. Completed records live for 24 hours from completion; active records have no expiration. Both maps live only for the lifetime of one Node.js process, so data is lost on restart and coordination does not cross application instances.
