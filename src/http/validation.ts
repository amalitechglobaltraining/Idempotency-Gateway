import type { PaymentRequest } from '../domain/types.js';

export function validateIdempotencyKey(value: unknown): string | undefined {
  // Enforce the transport limit on the raw field value before normalization.
  if (typeof value !== 'string' || value.length > 255) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function singleIdempotencyKeyHeader(rawHeaders: readonly string[]): string | undefined {
  const values: string[] = [];

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'idempotency-key') {
      const value = rawHeaders[index + 1];
      if (value !== undefined) {
        values.push(value);
      }
    }
  }

  return values.length === 1 ? values[0] : undefined;
}

export function validatePayment(value: unknown): PaymentRequest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const payment = value as Record<string, unknown>;
  if (
    typeof payment.amount !== 'number'
    || !Number.isFinite(payment.amount)
    || payment.amount <= 0
    || typeof payment.currency !== 'string'
    || !/^[A-Z]{3}$/.test(payment.currency)
  ) {
    return undefined;
  }

  return { amount: payment.amount, currency: payment.currency };
}
