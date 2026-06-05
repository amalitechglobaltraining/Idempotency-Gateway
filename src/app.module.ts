import { Module } from '@nestjs/common';
import { PaymentController } from './payment/payment.controller';
import { PaymentService } from './payment/payment.service';
import { IdempotencyService } from './idempotency/idempotency.service';

@Module({
  imports: [],
  controllers: [PaymentController],
  providers: [IdempotencyService, PaymentService],
})
export class AppModule {}
