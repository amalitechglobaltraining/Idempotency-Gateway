import type { CompletedRecord, IdempotencyRecord } from '../domain/types.js';

const COMPLETED_RECORD_RETENTION_MS = 24 * 60 * 60 * 1_000;

export class InMemoryIdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  find(idempotencyKey: string): IdempotencyRecord | undefined {
    const record = this.records.get(idempotencyKey);

    // Active processing ownership must never lapse while work may still complete.
    if (record?.status === 'COMPLETED' && record.expiresAt <= this.now()) {
      this.records.delete(idempotencyKey);
      return undefined;
    }

    return record ? structuredClone(record) : undefined;
  }

  claim(idempotencyKey: string, requestHash: string): boolean {
    // This synchronous check-and-set grants one owner within a single Node process.
    if (this.find(idempotencyKey)) {
      return false;
    }

    this.records.set(idempotencyKey, {
      idempotencyKey,
      requestHash,
      status: 'PROCESSING',
      createdAt: this.now(),
    });
    return true;
  }

  releaseProcessing(idempotencyKey: string, requestHash: string): boolean {
    const existing = this.records.get(idempotencyKey);
    if (existing?.status !== 'PROCESSING' || existing.requestHash !== requestHash) {
      return false;
    }

    this.records.delete(idempotencyKey);
    return true;
  }

  complete(idempotencyKey: string, responseStatus: number, responseBody: unknown): void {
    const existing = this.records.get(idempotencyKey);
    if (!existing) {
      throw new Error('Cannot complete an idempotency record that does not exist');
    }
    if (existing.status !== 'PROCESSING') {
      throw new Error('Cannot complete an idempotency record that is already completed');
    }

    const completedAt = this.now();
    const completed: CompletedRecord = {
      idempotencyKey: existing.idempotencyKey,
      requestHash: existing.requestHash,
      status: 'COMPLETED',
      responseStatus,
      // Preserve the response exactly as it was when the operation completed.
      responseBody: structuredClone(responseBody),
      createdAt: existing.createdAt,
      completedAt,
      expiresAt: completedAt + COMPLETED_RECORD_RETENTION_MS,
    };
    this.records.set(idempotencyKey, completed);
  }

  deleteExpired(): number {
    const now = this.now();
    let deleted = 0;

    for (const [key, record] of this.records) {
      if (record.status === 'COMPLETED' && record.expiresAt <= now) {
        this.records.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }
}
