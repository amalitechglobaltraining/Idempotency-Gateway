# Idempotency Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and document a small TypeScript API that executes one simulated payment for any number of identical requests sharing an idempotency key.

**Architecture:** An Express route delegates to a payment service. The service compares canonical request hashes, stores two-state records in an in-memory repository, and coordinates concurrent duplicates through a Promise registry. Dependencies for time and payment execution are injected so concurrency and expiration can be tested deterministically.

**Tech Stack:** Node.js 24, TypeScript 7, Express 5, Vitest 4, Supertest 7, tsx 4

---

## File Map

- `package.json`: scripts and runtime/development dependencies.
- `tsconfig.json`: strict TypeScript build configuration.
- `vitest.config.ts`: isolated Node test configuration.
- `.gitignore`: generated files, dependencies, logs, and local environment files.
- `src/domain/types.ts`: request, response, record, and service-result types.
- `src/domain/request-fingerprint.ts`: canonical JSON serialization and SHA-256 hashing.
- `src/storage/idempotency-repository.ts`: in-memory record ownership, completion, and expiration.
- `src/services/payment-simulator.ts`: two-second local payment simulation.
- `src/services/payment-service.ts`: idempotency and concurrency orchestration.
- `src/http/validation.ts`: request header and body validation.
- `src/app.ts`: Express application composition and error handling.
- `src/server.ts`: process startup and graceful shutdown.
- `test/request-fingerprint.test.ts`: deterministic hashing tests.
- `test/idempotency-repository.test.ts`: claim and expiration tests.
- `test/payment-service.test.ts`: replay, conflict, and in-flight concurrency tests.
- `test/app.test.ts`: endpoint acceptance tests.
- `README.md`: final submission documentation.
- `docs/requirements.md`: challenge-sized two-state requirements.
- `docs/data-structures.md`: concise storage model.
- `docs/algorithm.md`: algorithm description and existing diagram.
- `docs/statemachine.md`: existing two-state lifecycle, cleaned for consistent rendering.

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "idempotency-gateway",
  "version": "1.0.0",
  "private": true,
  "description": "A small payment API that safely handles retried requests.",
  "main": "dist/src/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^26.1.1",
    "@types/supertest": "^7.2.1",
    "supertest": "^7.2.2",
    "tsx": "^4.23.1",
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Add strict compiler and test configuration**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
  },
});
```

- [ ] **Step 3: Ignore generated and private files**

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 4: Install dependencies and verify the empty project builds**

Run: `npm install && npm run build`

Expected: dependencies install, `package-lock.json` is created, and TypeScript exits with code 0.

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: set up TypeScript project"
```

### Task 2: Request Fingerprinting

**Files:**
- Create: `src/domain/request-fingerprint.ts`
- Create: `test/request-fingerprint.test.ts`

- [ ] **Step 1: Write failing fingerprint tests**

```typescript
import { describe, expect, it } from 'vitest';
import { canonicalize, fingerprint } from '../src/domain/request-fingerprint.js';

describe('request fingerprint', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalize({ currency: 'GHS', details: { z: 2, a: 1 }, amount: 100 }))
      .toBe('{"amount":100,"currency":"GHS","details":{"a":1,"z":2}}');
  });

  it('creates the same hash for equivalent object key orders', () => {
    expect(fingerprint({ amount: 100, currency: 'GHS' }))
      .toBe(fingerprint({ currency: 'GHS', amount: 100 }));
  });

  it('creates different hashes for different payment values', () => {
    expect(fingerprint({ amount: 100, currency: 'GHS' }))
      .not.toBe(fingerprint({ amount: 500, currency: 'GHS' }));
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/request-fingerprint.test.ts`

Expected: FAIL because `src/domain/request-fingerprint.ts` does not exist.

- [ ] **Step 3: Implement canonical serialization and hashing**

```typescript
import { createHash } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalize(source[key]);
        return result;
      }, {});
  }

  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- test/request-fingerprint.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit fingerprinting**

```bash
git add src/domain/request-fingerprint.ts test/request-fingerprint.test.ts
git commit -m "feat: add request fingerprinting"
```

### Task 3: Idempotency Record Storage

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/storage/idempotency-repository.ts`
- Create: `test/idempotency-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

```typescript
import { describe, expect, it } from 'vitest';
import { InMemoryIdempotencyRepository } from '../src/storage/idempotency-repository.js';

describe('InMemoryIdempotencyRepository', () => {
  it('allows only one owner to claim a key', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);

    expect(repository.claim('payment-1', 'hash-1')).toBe(true);
    expect(repository.claim('payment-1', 'hash-1')).toBe(false);
  });

  it('stores the exact completed response', () => {
    const repository = new InMemoryIdempotencyRepository(() => 1_000);
    repository.claim('payment-1', 'hash-1');
    const body = { transactionId: 'txn-1', status: 'SUCCESS' as const };

    repository.complete('payment-1', 201, body);

    expect(repository.find('payment-1')).toMatchObject({
      status: 'COMPLETED',
      responseStatus: 201,
      responseBody: body,
      completedAt: 1_000,
      expiresAt: 86_401_000,
    });
  });

  it('removes expired completed records', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);
    repository.claim('payment-1', 'hash-1');
    repository.complete('payment-1', 201, { ok: true });
    now = 86_401_001;

    expect(repository.find('payment-1')).toBeUndefined();
  });

  it('never expires processing records', () => {
    let now = 1_000;
    const repository = new InMemoryIdempotencyRepository(() => now);
    repository.claim('payment-1', 'hash-1');
    now = 999_999_999;

    expect(repository.find('payment-1')?.status).toBe('PROCESSING');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/idempotency-repository.test.ts`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Define domain types**

```typescript
export interface PaymentRequest {
  amount: number;
  currency: string;
}

export interface PaymentResponse {
  transactionId: string;
  status: 'SUCCESS';
  message: string;
  amount: number;
  currency: string;
}

export interface ProcessingRecord {
  idempotencyKey: string;
  requestHash: string;
  status: 'PROCESSING';
  createdAt: number;
}

export interface CompletedRecord {
  idempotencyKey: string;
  requestHash: string;
  status: 'COMPLETED';
  responseStatus: number;
  responseBody: unknown;
  createdAt: number;
  completedAt: number;
  expiresAt: number;
}

export type IdempotencyRecord = ProcessingRecord | CompletedRecord;

export interface OperationResult {
  statusCode: number;
  body: unknown;
  cacheHit: boolean;
}
```

- [ ] **Step 4: Implement the repository**

```typescript
import type { IdempotencyRecord } from '../domain/types.js';

const RETENTION_MS = 24 * 60 * 60 * 1_000;

export class InMemoryIdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  find(key: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);

    if (record?.status === 'COMPLETED' && record.expiresAt <= this.now()) {
      this.records.delete(key);
      return undefined;
    }

    return record;
  }

  claim(key: string, requestHash: string): boolean {
    if (this.find(key)) {
      return false;
    }

    this.records.set(key, {
      idempotencyKey: key,
      requestHash,
      status: 'PROCESSING',
      createdAt: this.now(),
    });
    return true;
  }

  complete(key: string, responseStatus: number, responseBody: unknown): void {
    const existing = this.records.get(key);
    if (!existing) {
      throw new Error('Cannot complete a missing idempotency record.');
    }

    const completedAt = this.now();
    this.records.set(key, {
      idempotencyKey: key,
      requestHash: existing.requestHash,
      status: 'COMPLETED',
      responseStatus,
      responseBody,
      createdAt: existing.createdAt,
      completedAt,
      expiresAt: completedAt + RETENTION_MS,
    });
  }

  deleteExpired(): number {
    let deleted = 0;
    for (const [key, record] of this.records) {
      if (record.status === 'COMPLETED' && record.expiresAt <= this.now()) {
        this.records.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}
```

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm test -- test/idempotency-repository.test.ts`

Expected: 4 tests pass.

- [ ] **Step 6: Commit storage**

```bash
git add src/domain/types.ts src/storage/idempotency-repository.ts test/idempotency-repository.test.ts
git commit -m "feat: store idempotency records"
```

### Task 4: Payment Service and Concurrency

**Files:**
- Create: `src/services/payment-simulator.ts`
- Create: `src/services/payment-service.ts`
- Create: `test/payment-service.test.ts`

- [ ] **Step 1: Write failing service tests**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { InMemoryIdempotencyRepository } from '../src/storage/idempotency-repository.js';
import { PaymentService } from '../src/services/payment-service.js';
import type { PaymentResponse } from '../src/domain/types.js';

const response: PaymentResponse = {
  transactionId: 'txn-1',
  status: 'SUCCESS',
  message: 'Charged 100 GHS',
  amount: 100,
  currency: 'GHS',
};

describe('PaymentService', () => {
  it('stores and replays the first response', async () => {
    const processPayment = vi.fn().mockResolvedValue(response);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), processPayment);

    const first = await service.process('key-1', { amount: 100, currency: 'GHS' });
    const duplicate = await service.process('key-1', { currency: 'GHS', amount: 100 });

    expect(first).toEqual({ statusCode: 201, body: response, cacheHit: false });
    expect(duplicate).toEqual({ statusCode: 201, body: response, cacheHit: true });
    expect(processPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a key with a different payload', async () => {
    const processPayment = vi.fn().mockResolvedValue(response);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), processPayment);
    await service.process('key-1', { amount: 100, currency: 'GHS' });

    const conflict = await service.process('key-1', { amount: 500, currency: 'GHS' });

    expect(conflict).toEqual({
      statusCode: 409,
      body: { error: 'Idempotency key already used for a different request body.' },
      cacheHit: false,
    });
    expect(processPayment).toHaveBeenCalledTimes(1);
  });

  it('makes an identical in-flight request wait for one execution', async () => {
    let release!: (value: PaymentResponse) => void;
    const pending = new Promise<PaymentResponse>((resolve) => { release = resolve; });
    const processPayment = vi.fn().mockReturnValue(pending);
    const service = new PaymentService(new InMemoryIdempotencyRepository(), processPayment);

    const first = service.process('key-1', { amount: 100, currency: 'GHS' });
    const duplicate = service.process('key-1', { amount: 100, currency: 'GHS' });
    release(response);

    expect(await first).toEqual({ statusCode: 201, body: response, cacheHit: false });
    expect(await duplicate).toEqual({ statusCode: 201, body: response, cacheHit: true });
    expect(processPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects an in-flight request with a different payload without waiting', async () => {
    const processPayment = vi.fn().mockReturnValue(new Promise<PaymentResponse>(() => undefined));
    const service = new PaymentService(new InMemoryIdempotencyRepository(), processPayment);
    void service.process('key-1', { amount: 100, currency: 'GHS' });

    const conflict = await service.process('key-1', { amount: 500, currency: 'GHS' });

    expect(conflict.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/payment-service.test.ts`

Expected: FAIL because the payment service does not exist.

- [ ] **Step 3: Implement the simulator**

```typescript
import { randomUUID } from 'node:crypto';
import type { PaymentRequest, PaymentResponse } from '../domain/types.js';

export async function simulatePayment(payment: PaymentRequest): Promise<PaymentResponse> {
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  return {
    transactionId: randomUUID(),
    status: 'SUCCESS',
    message: `Charged ${payment.amount} ${payment.currency}`,
    amount: payment.amount,
    currency: payment.currency,
  };
}
```

- [ ] **Step 4: Implement the payment service**

```typescript
import { fingerprint } from '../domain/request-fingerprint.js';
import type { OperationResult, PaymentRequest, PaymentResponse } from '../domain/types.js';
import { InMemoryIdempotencyRepository } from '../storage/idempotency-repository.js';

const conflict: OperationResult = {
  statusCode: 409,
  body: { error: 'Idempotency key already used for a different request body.' },
  cacheHit: false,
};

export class PaymentService {
  private readonly inFlight = new Map<string, Promise<OperationResult>>();

  constructor(
    private readonly repository: InMemoryIdempotencyRepository,
    private readonly processPayment: (payment: PaymentRequest) => Promise<PaymentResponse>,
  ) {}

  async process(key: string, payment: PaymentRequest): Promise<OperationResult> {
    const requestHash = fingerprint(payment);
    const existing = this.repository.find(key);

    if (existing) {
      return this.handleExisting(key, requestHash, existing);
    }

    if (!this.repository.claim(key, requestHash)) {
      const claimed = this.repository.find(key);
      if (!claimed) {
        throw new Error('Claimed idempotency record is missing.');
      }
      return this.handleExisting(key, requestHash, claimed);
    }

    const operation = this.runOwnedPayment(key, payment);
    this.inFlight.set(key, operation);

    try {
      return await operation;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async handleExisting(
    key: string,
    requestHash: string,
    record: ReturnType<InMemoryIdempotencyRepository['find']> & {},
  ): Promise<OperationResult> {
    if (record.requestHash !== requestHash) {
      return conflict;
    }

    if (record.status === 'COMPLETED') {
      return {
        statusCode: record.responseStatus,
        body: record.responseBody,
        cacheHit: true,
      };
    }

    const operation = this.inFlight.get(key);
    if (!operation) {
      throw new Error('Processing operation is unavailable.');
    }

    const result = await operation;
    return { ...result, cacheHit: true };
  }

  private async runOwnedPayment(key: string, payment: PaymentRequest): Promise<OperationResult> {
    const body = await this.processPayment(payment);
    this.repository.complete(key, 201, body);
    return { statusCode: 201, body, cacheHit: false };
  }
}
```

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm test -- test/payment-service.test.ts`

Expected: 4 tests pass.

- [ ] **Step 6: Commit service behavior**

```bash
git add src/services/payment-simulator.ts src/services/payment-service.ts test/payment-service.test.ts
git commit -m "feat: coordinate idempotent payments"
```

### Task 5: HTTP API

**Files:**
- Create: `src/http/validation.ts`
- Create: `src/app.ts`
- Create: `test/app.test.ts`

- [ ] **Step 1: Write failing endpoint tests**

```typescript
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const payment = { amount: 100, currency: 'GHS' };

describe('POST /process-payment', () => {
  it('rejects a missing idempotency key', async () => {
    const response = await request(createApp()).post('/process-payment').send(payment);
    expect(response.status).toBe(400);
  });

  it.each([
    [{ amount: 0, currency: 'GHS' }],
    [{ amount: -1, currency: 'GHS' }],
    [{ amount: 100, currency: 'ghs' }],
    [{ amount: 100, currency: 'GH' }],
  ])('rejects invalid payment data', async (body) => {
    const response = await request(createApp())
      .post('/process-payment')
      .set('Idempotency-Key', 'key-1')
      .send(body);
    expect(response.status).toBe(400);
  });

  it('returns and replays a successful payment', async () => {
    const processPayment = vi.fn().mockResolvedValue({
      transactionId: 'txn-1', status: 'SUCCESS', message: 'Charged 100 GHS', ...payment,
    });
    const app = createApp({ processPayment });

    const first = await request(app).post('/process-payment').set('Idempotency-Key', 'key-1').send(payment);
    const duplicate = await request(app).post('/process-payment').set('Idempotency-Key', 'key-1').send(payment);

    expect(first.status).toBe(201);
    expect(first.headers['x-cache-hit']).toBe('false');
    expect(duplicate.status).toBe(201);
    expect(duplicate.headers['x-cache-hit']).toBe('true');
    expect(duplicate.body).toEqual(first.body);
    expect(processPayment).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when a key is reused for another payment', async () => {
    const app = createApp({ processPayment: vi.fn().mockResolvedValue({ ...payment }) });
    await request(app).post('/process-payment').set('Idempotency-Key', 'key-1').send(payment);
    const response = await request(app).post('/process-payment').set('Idempotency-Key', 'key-1')
      .send({ amount: 500, currency: 'GHS' });
    expect(response.status).toBe(409);
  });

  it('returns a safe response for malformed JSON', async () => {
    const response = await request(createApp()).post('/process-payment')
      .set('Idempotency-Key', 'key-1').set('Content-Type', 'application/json').send('{');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Request body must be valid JSON.' });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/app.test.ts`

Expected: FAIL because the application module does not exist.

- [ ] **Step 3: Implement validation**

```typescript
import type { PaymentRequest } from '../domain/types.js';

export function validateIdempotencyKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 255
    ? value.trim()
    : undefined;
}

export function validatePayment(value: unknown): PaymentRequest | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    return undefined;
  }
  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) {
    return undefined;
  }
  return { amount: body.amount, currency: body.currency };
}
```

- [ ] **Step 4: Compose the Express application**

```typescript
import express, { type ErrorRequestHandler } from 'express';
import type { PaymentRequest, PaymentResponse } from './domain/types.js';
import { validateIdempotencyKey, validatePayment } from './http/validation.js';
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
  const service = new PaymentService(repository, dependencies.processPayment ?? simulatePayment);

  app.use(express.json());
  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
  app.post('/process-payment', async (request, response, next) => {
    try {
      const key = validateIdempotencyKey(request.get('Idempotency-Key'));
      const payment = validatePayment(request.body);
      if (!key || !payment) {
        response.status(400).json({ error: 'A valid Idempotency-Key, amount and currency are required.' });
        return;
      }

      const result = await service.process(key, payment);
      response.set('X-Cache-Hit', String(result.cacheHit)).status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Request body must be valid JSON.' });
      return;
    }
    response.status(500).json({ error: 'An unexpected error occurred.' });
  };
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run the endpoint tests and verify GREEN**

Run: `npm test -- test/app.test.ts`

Expected: all endpoint tests pass.

- [ ] **Step 6: Commit the HTTP API**

```bash
git add src/http/validation.ts src/app.ts test/app.test.ts
git commit -m "feat: expose payment endpoint"
```

### Task 6: Server Startup

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Add the process entry point**

```typescript
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => {
  console.log(`Idempotency gateway listening on port ${port}`);
});

function shutdown(): void {
  server.close((error) => {
    if (error) {
      console.error('Failed to stop the server cleanly.', error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 2: Build and smoke-test startup**

Run: `npm run build`

Expected: TypeScript exits with code 0 and produces `dist/src/server.js`.

Run the built server with a temporary port, request `GET /health`, confirm `200 {"status":"ok"}`, and stop the process.

- [ ] **Step 3: Commit startup**

```bash
git add src/server.ts package.json
git commit -m "feat: add server startup"
```

### Task 7: Submission Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/requirements.md`
- Modify: `docs/algorithm.md`
- Modify: `docs/statemachine.md`
- Create: `docs/data-structures.md`
- Add: `diagrams/algorithm.png`

- [ ] **Step 1: Replace the README challenge text**

Write a concise README containing these exact sections and verified commands:

```markdown
# Idempotency Gateway

A TypeScript API that prevents a retried payment request from running more than once.

## Architecture

![Request flow](diagrams/algorithm.png)

## How It Works

Explain first requests, completed duplicates, in-flight duplicates, and conflicts in plain language.

## Setup

```bash
npm install
npm run build
npm start
```

## API

Document `GET /health` and `POST /process-payment`, including curl commands and all `201`, `400`, and `409` responses.

## Design Decisions

Document canonical hashing, atomic Map ownership, Promise coordination, exact response replay, and single-instance scope.

## Developer's Choice: Safe Expiration

Explain why only completed records expire after 24 hours.

## Testing

```bash
npm test
```

## Production Improvements

List persistent storage, distributed coordination, downstream idempotency, authentication, rate limiting, audit logging, and reconciliation.
```

- [ ] **Step 2: Align supporting documents**

Rewrite `docs/requirements.md` to cover only the acceptance criteria implemented by the two-state service. Create `docs/data-structures.md` for the record and in-flight Promise map. Expand `docs/algorithm.md` with a short textual algorithm above the existing PNG. Preserve `docs/statemachine.md` content while fixing encoding problems and ensuring its filename is referenced consistently.

- [ ] **Step 3: Verify documentation references**

Run: `rg -n "FAILED|INDETERMINATE|reconciliationAttempts|processingDeadline" README.md docs -g '!docs/superpowers/**'`

Expected: no matches except a clearly labelled production-improvements sentence if retained.

Run: `Test-Path diagrams/algorithm.png`

Expected: `True`.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/requirements.md docs/algorithm.md docs/statemachine.md docs/data-structures.md diagrams/algorithm.png
git commit -m "docs: document the idempotency gateway"
```

### Task 8: Completion Verification and Delivery

**Files:**
- Modify only files required by failures found during verification.

- [ ] **Step 1: Run all automated checks**

Run: `npm test`

Expected: every test passes with no unhandled errors.

Run: `npm run build`

Expected: TypeScript exits with code 0.

Run: `git diff --check origin/main...HEAD`

Expected: no whitespace errors.

- [ ] **Step 2: Run a real HTTP smoke test**

Start the built server on a temporary port. Send:

1. a first payment request;
2. an identical completed duplicate;
3. the same key with another amount;
4. two concurrent identical requests with a new key.

Verify status codes `201`, `201`, `409`, `201`, and `201`; cache headers `false`, `true`, and `true` for the duplicate; identical transaction IDs for duplicates; and a single two-second processing window for concurrent requests.

- [ ] **Step 3: Audit submission requirements**

Confirm:

- `npm start` launches the built server;
- README contains the diagram, setup, API examples, design decisions, safety feature, tests, and limitations;
- no generated directories or secrets are tracked;
- all expected source and test files are tracked;
- commit authors are `Prudentkurler <sarkodiekurler@gmail.com>`;
- the working tree contains no unintended files.

- [ ] **Step 4: Push the existing feature branch**

Run: `git push -u origin feat/idempotency-core`

Expected: the remote branch advances to the final verified commit.

- [ ] **Step 5: Report delivery**

Provide the branch name, final commit, remote URL, test count, build result, smoke-test result, and any remaining submission action. Do not claim that a pull request exists unless one was actually created and verified.
