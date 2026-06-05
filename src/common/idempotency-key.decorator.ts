import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extracts the raw `Idempotency-Key` header. Unlike the built-in `@Headers()`
 * decorator, a custom param decorator supports pipes, so it can be combined with
 * IdempotencyKeyPipe: `@IdempotencyKey(IdempotencyKeyPipe) key: string`.
 *
 * Returns the raw header value (string | string[] | undefined); all validation,
 * trimming and normalization happen in the pipe.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers['idempotency-key'];
  },
);
