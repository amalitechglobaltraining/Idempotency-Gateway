const crypto = require('crypto');

const PROCESSING_DELAY_MS = 2000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


async function processPayment(amount, currency) {
  await delay(PROCESSING_DELAY_MS);

  return {
    statusCode: 201,
    body: {
      message: `Charged ${amount} ${currency}`,
      transactionId: crypto.randomUUID(),
      status: 'success',
    },
  };
}

module.exports = { processPayment };