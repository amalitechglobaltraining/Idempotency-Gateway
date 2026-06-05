import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Reject unknown/invalid bodies globally so a malformed request never reaches
  // the payment logic or reserves an idempotency key. `transform` coerces the
  // raw JSON into a typed ProcessPaymentDto; `forbidUnknownValues` ensures a
  // top-level non-object payload cannot masquerade as a valid empty DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Idempotency-Gateway listening on http://localhost:${port}`);
}

bootstrap();
