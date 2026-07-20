import { afterEach, describe, expect, it, vi } from 'vitest';

import { simulatePayment } from '../src/services/payment-simulator.js';

describe('simulatePayment', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the successful payment response after exactly two seconds', async () => {
    vi.useFakeTimers();
    let settled = false;
    const payment = simulatePayment({ amount: 125, currency: 'EUR' });
    void payment.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await payment;

    expect(settled).toBe(true);
    expect(result).toEqual({
      transactionId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      status: 'SUCCESS',
      message: 'Charged 125 EUR',
      amount: 125,
      currency: 'EUR',
    });
  });
});
