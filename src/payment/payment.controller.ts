import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { IdempotencyKeyPipe } from '../common/idempotency-key.pipe';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { EMIT_INFLIGHT_CACHE_HIT } from '../idempotency/idempotency.constants';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { PaymentService } from './payment.service';

@Controller()
export class PaymentController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly payment: PaymentService,
  ) {}

  /**
   * The single payment endpoint. The Idempotency-Key pipe is declared FIRST so a
   * missing/invalid key is rejected (400) before body validation. The body is
   * validated by the global ValidationPipe. We use a passthrough Response only to
   * set the replayed status code and the X-Cache-Hit header; the returned value
   * is the response body.
   */
  @Post('process-payment')
  async process(
    @Headers('idempotency-key', IdempotencyKeyPipe) key: string,
    @Body() body: ProcessPaymentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const { response, cacheHit } = await this.idempotency.handle(key, body, () =>
      this.payment.charge(body),
    );

    if (cacheHit && EMIT_INFLIGHT_CACHE_HIT) {
      res.setHeader('X-Cache-Hit', 'true');
    }
    res.status(response.statusCode);
    return response.body;
  }
}
