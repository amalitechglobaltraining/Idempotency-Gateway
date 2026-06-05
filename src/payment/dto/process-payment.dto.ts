import { IsNumber, IsPositive, IsString, Length, IsUppercase } from 'class-validator';

/**
 * The payment request body. Only these declared fields participate in the
 * idempotency fingerprint (see body-fingerprint.util). The global ValidationPipe
 * is configured with `whitelist + forbidNonWhitelisted + forbidUnknownValues`,
 * so any extra field, a non-object payload, or a wrong-typed field is rejected
 * with 400 *before* a key is ever reserved or a charge attempted.
 */
export class ProcessPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @Length(3, 3)
  @IsUppercase()
  currency!: string;
}
