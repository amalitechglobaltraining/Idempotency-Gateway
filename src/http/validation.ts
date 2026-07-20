import type { PaymentRequest } from '../domain/types.js';

export function validateIdempotencyKey(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 255) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
