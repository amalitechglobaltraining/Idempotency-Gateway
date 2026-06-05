import { Injectable } from '@nestjs/common';
import { ProcessPaymentDto } from './dto/process-payment.dto';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stands in for a real payment processor. The ~2s "processing" delay lives ONLY
 * here, so the idempotency layer can be reasoned about (and tested) without any
 * timing of its own. The delay is env-overridable (`PROCESSING_DELAY_MS`) so the
 * e2e suite can run fast while still proving "first request is slow, replay is
 * instant".
 *
 * The simulated charge either succeeds or throws an *infrastructure* error; it
 * never models a business decline (e.g. "card declined"). That boundary is
 * intentional and documented in the README — it makes the gateway's uniform
 * "delete the key on failure so it can be retried" policy correct.
 */
@Injectable()
export class PaymentService {
  async charge(
    dto: ProcessPaymentDto,
  ): Promise<{ statusCode: number; body: { status: string; amount: number; currency: string } }> {
    const delayMs = Number(process.env.PROCESSING_DELAY_MS ?? 2000);
    await sleep(delayMs);

    return {
      statusCode: 201,
      body: {
        status: `Charged ${dto.amount} ${dto.currency}`,
        amount: dto.amount,
        currency: dto.currency,
      },
    };
  }
}
