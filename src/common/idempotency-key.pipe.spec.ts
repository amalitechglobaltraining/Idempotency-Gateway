import { BadRequestException } from '@nestjs/common';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import { MAX_KEY_LEN } from '../idempotency/idempotency.constants';

describe('IdempotencyKeyPipe', () => {
  const pipe = new IdempotencyKeyPipe();

  it('accepts and trims a valid key', () => {
    expect(pipe.transform('  abc-123  ')).toBe('abc-123');
  });

  it('treats whitespace-padded and bare keys as the same identity', () => {
    expect(pipe.transform('  k ')).toBe(pipe.transform('k'));
  });

  it('rejects a missing key', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    expect(() => pipe.transform(undefined)).toThrow('Idempotency-Key header is required.');
  });

  it('rejects an empty / whitespace-only key', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
    expect(() => pipe.transform('   ')).toThrow(BadRequestException);
  });

  it('rejects an oversized key', () => {
    const tooLong = 'x'.repeat(MAX_KEY_LEN + 1);
    expect(() => pipe.transform(tooLong)).toThrow(
      `Idempotency-Key exceeds maximum length (${MAX_KEY_LEN}).`,
    );
  });

  it('accepts a key exactly at the maximum length', () => {
    const atLimit = 'x'.repeat(MAX_KEY_LEN);
    expect(pipe.transform(atLimit)).toBe(atLimit);
  });

  it('takes the first value of a multi-valued header', () => {
    expect(pipe.transform(['first', 'second'])).toBe('first');
  });
});
