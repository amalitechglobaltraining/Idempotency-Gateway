import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MAX_KEY_LEN } from '../idempotency/idempotency.constants';

/**
 * Validates and normalizes the `Idempotency-Key` header during argument
 * resolution, before the controller method body runs. Bound to the header param
 * with `@Headers('idempotency-key', IdempotencyKeyPipe)`.
 *
 * Responsibilities:
 *  - reject a missing / empty / whitespace-only key            -> 400
 *  - collapse a multi-valued header (duplicate headers) to the first value
 *  - trim it (the trimmed value becomes the store key, so "  k " and "k"
 *    are the same idempotency identity)
 *  - reject keys longer than MAX_KEY_LEN                        -> 400
 */
@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    // Express surfaces duplicate headers as an array; take the first value.
    const raw = Array.isArray(value) ? value[0] : value;

    if (typeof raw !== 'string') {
      throw new BadRequestException('Idempotency-Key header is required.');
    }

    const key = raw.trim();
    if (key.length === 0) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    if (key.length > MAX_KEY_LEN) {
      throw new BadRequestException(
        `Idempotency-Key exceeds maximum length (${MAX_KEY_LEN}).`,
      );
    }

    return key;
  }
}
