const { describe, it, before,after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

after(() => {
  server.close();
});

// Helper to make requests
async function makeRequest(key, body) {
  const response = await fetch(`${baseUrl}/process-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { status: response.status, body: data, headers: response.headers };
}

describe('Validation', () => {
  it('rejects request with missing Idempotency-Key', async () => {
    const response = await fetch(`${baseUrl}/process-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, currency: 'GHS' }),
    });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.error, 'Idempotency-Key header is required');
  });

  it('rejects request with blank Idempotency-Key', async () => {
    const response = await fetch(`${baseUrl}/process-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': '   ' },
      body: JSON.stringify({ amount: 100, currency: 'GHS' }),
    });
    assert.equal(response.status, 400);
  });

  it('rejects missing amount', async () => {
    const { status, body } = await makeRequest('test-amount', { currency: 'GHS' });
    assert.equal(status, 400);
    assert.equal(body.error, 'Amount must be a positive number');
  });

  it('rejects negative amount', async () => {
    const { status } = await makeRequest('test-negative', { amount: -10, currency: 'GHS' });
    assert.equal(status, 400);
  });

  it('rejects invalid currency', async () => {
    const { status, body } = await makeRequest('test-currency', { amount: 100, currency: 'GHANA' });
    assert.equal(status, 400);
  });
});

describe('Idempotency', () => {
  it('processes a new payment and returns 201', async () => {
    const { status, body } = await makeRequest('new-payment-001', { amount: 100, currency: 'GHS' });
    assert.equal(status, 201);
    assert.equal(body.message, 'Charged 100 GHS');
    assert.ok(body.transactionId);
    assert.equal(body.status, 'success');
  });

  it('replays the same response for a duplicate request', async () => {
    const key = 'duplicate-001';
    const payload = { amount: 100, currency: 'GHS' };

    const first = await makeRequest(key, payload);
    const second = await makeRequest(key, payload);

    assert.equal(second.status, 201);
    assert.equal(second.body.transactionId, first.body.transactionId);
    assert.equal(second.headers.get('x-cache-hit'), 'true');
  });

  it('treats same body with different key order as identical', async () => {
    const key = 'canonical-001';

    const first = await makeRequest(key, { amount: 100, currency: 'GHS' });
    const second = await makeRequest(key, { currency: 'GHS', amount: 100 });

    assert.equal(second.body.transactionId, first.body.transactionId);
    assert.equal(second.headers.get('x-cache-hit'), 'true');
  });

  it('rejects same key with different body', async () => {
    const key = 'conflict-001';

    await makeRequest(key, { amount: 100, currency: 'GHS' });
    const { status, body } = await makeRequest(key, { amount: 500, currency: 'GHS' });

    assert.equal(status, 422);
    assert.equal(body.error, 'Idempotency key already used for a different request body.');
  });

  it('handles concurrent requests with same key', async () => {
    const key = 'concurrent-001';
    const payload = { amount: 300, currency: 'GHS' };

    const [first, second] = await Promise.all([
      makeRequest(key, payload),
      makeRequest(key, payload),
    ]);

    assert.equal(first.body.transactionId, second.body.transactionId);
  });
});