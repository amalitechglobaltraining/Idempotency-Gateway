import express from 'express';
import paymentRoutes from './routes/payment.route.js';

const app = express();


app.use(express.json());



app.use('/', paymentRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});
 
app.use((err, req, res, next) => {
  // check for malformed json
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid or missing request body' });
  }

  // log all other errors and return 500
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});
export default app;