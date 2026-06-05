import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { IdempotencyService } from '../src/idempotency/idempotency.service';

// Keep the simulated charge fast so the suite runs quickly while still proving
// "first request is slow, replay is instant".
const DELAY_MS = 200;
process.env.PROCESSING_DELAY_MS = String(DELAY_MS);

function applyPipes(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );
}

const VALID = { amount: 100, currency: 'GHS' };

describe('POST /process-payment (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    applyPipes(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('US1: processes a first request and returns "Charged 100 GHS"', async () => {
    const started = Date.now();
    const res = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', 'us1-key')
      .send(VALID);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'Charged 100 GHS', amount: 100, currency: 'GHS' });
    expect(res.headers['x-cache-hit']).toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(DELAY_MS - 20);
  });

  it('US2: replays a duplicate instantly with X-Cache-Hit', async () => {
    const key = 'us2-key';
    const first = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(VALID);
    expect(first.status).toBe(201);

    const started = Date.now();
    const replay = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(VALID);

    expect(replay.status).toBe(201);
    expect(replay.headers['x-cache-hit']).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(Date.now() - started).toBeLessThan(DELAY_MS); // no reprocessing
  });

  it('US3: rejects the same key with a different body (409)', async () => {
    const key = 'us3-key';
    await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(VALID);

    const conflict = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send({ amount: 500, currency: 'GHS' });

    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toBe(
      'Idempotency key already used for a different request body.',
    );
  });

  it('US4 (bonus): two concurrent duplicates coalesce onto one charge', async () => {
    const key = 'us4-key';
    const send = () =>
      request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', key)
        .send(VALID);

    const started = Date.now();
    const [a, b] = await Promise.all([send(), send()]);
    const elapsed = Date.now() - started;

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body).toEqual(b.body);

    // Exactly one response is the originator (no header) and one is the replay.
    const hits = [a, b].filter((r) => r.headers['x-cache-hit'] === 'true');
    expect(hits).toHaveLength(1);

    // Both finished in roughly one processing window, not two.
    expect(elapsed).toBeLessThan(DELAY_MS * 2);
  });

  describe('validation / guards', () => {
    it('400 when the Idempotency-Key header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/process-payment')
        .send(VALID); // valid body, so the header error is the one returned
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Idempotency-Key header is required.');
    });

    it('400 when the Idempotency-Key header is oversized', async () => {
      const res = await request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', 'x'.repeat(256))
        .send(VALID);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('maximum length');
    });

    it('400 on an invalid body (negative amount / lowercase currency)', async () => {
      const res = await request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', 'bad-body-1')
        .send({ amount: -5, currency: 'ghs' });
      expect(res.status).toBe(400);
    });

    it('400 (not 409) on an extra/undeclared field', async () => {
      const res = await request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', 'extra-field')
        .send({ amount: 100, currency: 'GHS', sneaky: true });
      expect(res.status).toBe(400);
    });

    it('400 (not 409) when amount is a string instead of a number', async () => {
      const res = await request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', 'string-amount')
        .send({ amount: '100', currency: 'GHS' });
      expect(res.status).toBe(400);
    });

    it('400 on an empty body and on a non-object body', async () => {
      const empty = await request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', 'empty-body')
        .send({});
      expect(empty.status).toBe(400);

      const arr = await request(app.getHttpServer())
        .post('/process-payment')
        .set('Idempotency-Key', 'array-body')
        .send([]);
      expect(arr.status).toBe(400);
    });
  });

  it('replays for the same body regardless of JSON key order', async () => {
    const key = 'order-key';
    const first = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send({ amount: 100, currency: 'GHS' });
    const replay = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send({ currency: 'GHS', amount: 100 });

    expect(replay.status).toBe(201);
    expect(replay.headers['x-cache-hit']).toBe('true');
    expect(replay.body).toEqual(first.body);
  });
});

describe('TTL expiry (e2e)', () => {
  let app: INestApplication;
  const TTL_MS = 300;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IdempotencyService)
      .useValue(new IdempotencyService({ ttlMs: TTL_MS, inFlightTimeoutMs: 60_000 }))
      .compile();
    app = moduleRef.createNestApplication();
    applyPipes(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('re-charges the same key once it has expired', async () => {
    const key = 'ttl-key';
    const first = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(VALID);
    expect(first.status).toBe(201);
    expect(first.headers['x-cache-hit']).toBeUndefined();

    await new Promise((r) => setTimeout(r, TTL_MS + DELAY_MS + 100)); // let the key expire

    const afterExpiry = await request(app.getHttpServer())
      .post('/process-payment')
      .set('Idempotency-Key', key)
      .send(VALID);
    expect(afterExpiry.status).toBe(201);
    expect(afterExpiry.headers['x-cache-hit']).toBeUndefined(); // processed fresh, not replayed
  });
});
