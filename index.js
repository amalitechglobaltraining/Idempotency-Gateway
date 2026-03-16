
const express = require('express');
const idempotencyStore = require('./idempotencyStore');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('Idempotency-Gateway API is running.');
});

// POST /process-payment with idempotency logic

// Exportable handler for test and app use

// In-memory rate limiter: { [key]: [timestamps] }
const rateLimitWindowMs = 60 * 1000; // 1 minute
const rateLimitMax = 5;
const rateLimitMap = new Map();

async function processPaymentHandler(req, res) {
  const key = req.header('Idempotency-Key');
  const bodyString = JSON.stringify(req.body);
  if (!key) {
    return res.status(400).json({ error: 'Idempotency-Key header is required.' });
  }
  if (!req.body || typeof req.body.amount !== 'number' || !req.body.currency) {
    return res.status(400).json({ error: 'Request body must include amount (number) and currency.' });
  }

  // Rate limiting logic
  const now = Date.now();
  let timestamps = rateLimitMap.get(key) || [];
  // Remove timestamps outside window
  timestamps = timestamps.filter(ts => now - ts < rateLimitWindowMs);
  if (timestamps.length >= rateLimitMax) {
    return res.status(429).json({ error: `Rate limit exceeded: max ${rateLimitMax} requests per minute for this Idempotency-Key.` });
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);

  let entry = idempotencyStore.get(key);
  if (entry) {
    // Check for body mismatch (fraud/error)
    if (entry.body !== bodyString) {
      return res.status(409).json({ error: 'Idempotency key already used for a different request body.' });
    }
    // If response is ready, return cached
    if (entry.response) {
      res.set('X-Cache-Hit', 'true');
      return res.status(entry.response.statusCode).json(entry.response.body);
    }
    // In-flight: wait for promise
    try {
      const cached = await entry.promise;
      res.set('X-Cache-Hit', 'true');
      return res.status(cached.statusCode).json(cached.body);
    } catch (err) {
      return res.status(500).json({ error: 'Internal error during in-flight handling.' });
    }
  }

  // First request: process and store promise
  let resolvePromise;
  const processingPromise = new Promise((resolve) => { resolvePromise = resolve; });
  idempotencyStore.set(key, { body: bodyString, promise: processingPromise });

  // Simulate payment processing (2s delay)
  setTimeout(() => {
    const response = {
      statusCode: 201,
      body: { status: `Charged ${req.body.amount} ${req.body.currency}` },
    };
    idempotencyStore.set(key, { body: bodyString, response });
    resolvePromise(response);
    res.status(response.statusCode).json(response.body);
  }, 2000);
}

app.post('/process-payment', processPaymentHandler);


// Only start server if run directly (not required by test)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Export for testing
module.exports = { app, processPaymentHandler };
