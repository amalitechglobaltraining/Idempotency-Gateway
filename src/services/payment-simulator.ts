import { randomUUID } from 'node:crypto';

import type { PaymentRequest, PaymentResponse } from '../domain/types.js';

export async function simulatePayment(payment: PaymentRequest): Promise<PaymentResponse> {
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  return {
    transactionId: randomUUID(),
    status: 'SUCCESS',
    message: `Charged ${payment.amount} ${payment.currency}`,
    amount: payment.amount,
    currency: payment.currency,
  };
}
