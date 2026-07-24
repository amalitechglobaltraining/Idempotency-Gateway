export const validatePaymentBody = function ValidatePaymentBody(req, res, next) {
  // check if body is empty
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Invalid or missing request body' });
  }

  const { amount, currency } = req.body;

  // positive number
  if (typeof amount !== "number" || amount <= 0 || !Number.isFinite(amount)) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  // valid currency
  if (typeof currency !== 'string' || !isValidCurrencyCode(currency.trim().toUpperCase())) {
    return res.status(400).json({ error: 'Currency must be a valid currency code' });
  }


  req.body.currency = currency.trim().toUpperCase();

  next();
};

function isValidCurrencyCode(code) {
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(0);
    return true;
  } catch (e) {
    return false;
  }
}