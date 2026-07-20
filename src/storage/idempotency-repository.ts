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

    return record;
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

  complete(idempotencyKey: string, responseStatus: number, responseBody: unknown): void {
    const existing = this.records.get(idempotencyKey);
    if (!existing) {
      throw new Error('Cannot complete an idempotency record that does not exist');
    }

    const completedAt = this.now();
    const completed: CompletedRecord = {
      idempotencyKey: existing.idempotencyKey,
      requestHash: existing.requestHash,
      status: 'COMPLETED',
      responseStatus,
      responseBody,
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
