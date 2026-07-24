import express from 'express';
import { validateHeaders } from '../middleware/validateHeaders.middleware.js';
import { validatePaymentBody } from '../middleware/validatePaymentBody.middleware.js';
import { processPaymentHandler } from '../controller/payment.controller.js';

const router = express.Router();

router.post('/process-payment', validateHeaders, validatePaymentBody, processPaymentHandler);

export default router;