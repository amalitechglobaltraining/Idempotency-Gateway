import { Module } from '@nestjs/common';

// Controllers and providers are wired in as later commits introduce them
// (PaymentController + IdempotencyService). The scaffold boots as an empty app.
@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
