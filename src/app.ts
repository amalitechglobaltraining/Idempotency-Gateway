import express, { type ErrorRequestHandler } from 'express';

import type { PaymentRequest, PaymentResponse } from './domain/types.js';
import {
  singleIdempotencyKeyHeader,
  validateIdempotencyKey,
  validatePayment,
} from './http/validation.js';
import { PaymentService } from './services/payment-service.js';
import { simulatePayment } from './services/payment-simulator.js';
import { InMemoryIdempotencyRepository } from './storage/idempotency-repository.js';

interface AppDependencies {
  processPayment?: (payment: PaymentRequest) => Promise<PaymentResponse>;
  repository?: InMemoryIdempotencyRepository;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const repository = dependencies.repository ?? new InMemoryIdempotencyRepository();
  // One injected dependency graph keeps tests isolated and repository coordination shared.
  const service = new PaymentService(repository, dependencies.processPayment ?? simulatePayment);

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.post('/process-payment', async (request, response, next) => {
    const idempotencyKey = validateIdempotencyKey(singleIdempotencyKeyHeader(request.rawHeaders));
    if (!idempotencyKey) {
      response.status(400).json({ error: 'A valid Idempotency-Key header is required.' });
      return;
    }

    const payment = validatePayment(request.body);
    if (!payment) {
      response.status(400).json({ error: 'A valid payment with amount and currency is required.' });
      return;
    }

    try {
      const result = await service.process(idempotencyKey, payment);
      response.set('X-Cache-Hit', String(result.cacheHit));
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  // Error middleware must follow routes to receive parsing and asynchronous failures.
  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (isBodyParserError(error, 'entity.parse.failed')) {
      response.status(400).json({ error: 'Request body must be valid JSON.' });
      return;
    }
    if (isBodyParserError(error, 'entity.too.large')) {
      response.status(413).json({ error: 'Request body is too large.' });
      return;
    }

    response.status(500).json({ error: 'An unexpected error occurred.' });
  };
  app.use(handleError);

  return app;
}

function isBodyParserError<T extends 'entity.parse.failed' | 'entity.too.large'>(
  error: unknown,
  type: T,
): error is { type: T } {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === type;
}
