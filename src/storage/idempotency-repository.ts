import type { CompletedRecord, IdempotencyRecord } from '../domain/types.js';

const COMPLETED_RECORD_RETENTION_MS = 24 * 60 * 60 * 1_000;

export class InMemoryIdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  find(key: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);

    // Active processing ownership must never lapse while work may still complete.
    if (record?.status === 'COMPLETED' && record.expiresAt <= this.now()) {
      this.records.delete(key);
      return undefined;
    }

    return record;
  }

  claim(key: string, hash: string): boolean {
    // This synchronous check-and-set grants one owner within a single Node process.
    if (this.find(key)) {
      return false;
    }

    this.records.set(key, {
      key,
      hash,
      status: 'PROCESSING',
      createdAt: this.now(),
    });
    return true;
  }

  complete(key: string, responseStatus: number, responseBody: unknown): void {
    const existing = this.records.get(key);
    if (!existing) {
      throw new Error('Cannot complete an idempotency record that does not exist');
    }

    const completedAt = this.now();
    const completed: CompletedRecord = {
      key: existing.key,
      hash: existing.hash,
      status: 'COMPLETED',
      responseStatus,
      responseBody,
      createdAt: existing.createdAt,
      completedAt,
      expiresAt: completedAt + COMPLETED_RECORD_RETENTION_MS,
    };
    this.records.set(key, completed);
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
