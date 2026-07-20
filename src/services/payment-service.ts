import type {
  IdempotencyRecord,
  OperationResult,
  PaymentRequest,
  PaymentResponse,
} from '../domain/types.js';
import { fingerprint } from '../domain/request-fingerprint.js';
import { InMemoryIdempotencyRepository } from '../storage/idempotency-repository.js';

const conflictResult: OperationResult = {
  statusCode: 409,
  body: { error: 'Idempotency key already used for a different request body.' },
  cacheHit: false,
};

export class PaymentService {
  private readonly inFlight = new Map<string, Promise<OperationResult>>();

  constructor(
    private readonly repository: InMemoryIdempotencyRepository,
    private readonly processPayment: (payment: PaymentRequest) => Promise<PaymentResponse>,
  ) {}

  async process(idempotencyKey: string, payment: PaymentRequest): Promise<OperationResult> {
    const requestHash = fingerprint(payment);
    const existing = this.repository.find(idempotencyKey);

    if (existing) {
      return this.handleExisting(existing, requestHash);
    }

    if (!this.repository.claim(idempotencyKey, requestHash)) {
      const claimed = this.repository.find(idempotencyKey);
      if (!claimed) {
        throw new Error('Idempotency record disappeared after claim');
      }
      return this.handleExisting(claimed, requestHash);
    }

    // Publish the shared promise before this request yields to a duplicate.
    const owned = this.runOwned(idempotencyKey, payment);
    this.inFlight.set(idempotencyKey, owned);

    try {
      return await owned;
    } finally {
      // Do not let completed operations accumulate in process memory.
      this.inFlight.delete(idempotencyKey);
    }
  }

  private async handleExisting(
    existing: IdempotencyRecord,
    requestHash: string,
  ): Promise<OperationResult> {
    if (existing.requestHash !== requestHash) {
      return conflictResult;
    }

    if (existing.status === 'COMPLETED') {
      return {
        statusCode: existing.responseStatus,
        body: existing.responseBody,
        cacheHit: true,
      };
    }

    const owned = this.inFlight.get(existing.idempotencyKey);
    if (!owned) {
      throw new Error('Processing idempotency record has no in-flight operation');
    }

    // All identical duplicates observe the owner's exact outcome.
    const result = await owned;
    return { ...result, cacheHit: true };
  }

  private async runOwned(
    idempotencyKey: string,
    payment: PaymentRequest,
  ): Promise<OperationResult> {
    const response = await this.processPayment(payment);
    this.repository.complete(idempotencyKey, 201, response);
    return { statusCode: 201, body: response, cacheHit: false };
  }
}
