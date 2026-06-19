const express = require('express');
const router = express.Router();
const validateHeaders = require('../middleware/validateHeaders');
const validateBody = require('../middleware/validatePaymentBody');
const { getEntry, saveProcessing, saveComplete, cleanup } = require('../services/idempotencyStore');
const { processPayment } = require('../services/paymentProcess');
const hashBody = require('../utils/hashBody');



router.post('/process-payment', validateHeaders, validateBody, async (req, res) => {
  const idempotencyKey = req.idempotencyKey;
  const bodyHash = hashBody(req.body);
  const { amount, currency } = req.body;

  // Remove stale entries 
  cleanup();

  const existingEntry = getEntry(idempotencyKey);

  // New key :process the payment for the first time
  if (!existingEntry) {
    const processingPromise = processPayment(amount, currency);
    saveProcessing(idempotencyKey, bodyHash, processingPromise);

    const response = await processingPromise;
    saveComplete(idempotencyKey, response);

    return res.status(response.statusCode).json(response.body);
  }

  // conflict check: Same key, different body
  if (existingEntry.bodyHash !== bodyHash) {
    return res.status(422).json({
      error: 'Idempotency key already used for a different request body.',
    });
  }

  // Same key, same body, still processing
  if (existingEntry.status === 'processing') {
    const response = await existingEntry.promise;
    return res
      .status(response.statusCode)
      .set('X-Cache-Hit', 'true')
      .json(response.body);
  }

  // Same key, same body, already done 
  // replay stored response immediately
  if (existingEntry.status === 'done') {
    return res
      .status(existingEntry.response.statusCode)
      .set('X-Cache-Hit', 'true')
      .json(existingEntry.response.body);
  }



  // Defensive fallback should never reach here
  return res.status(500).json({ error: 'Invalid idempotency record state' });
});

module.exports = router;