const express = require('express');

const app = express();


app.use(express.json());


const paymentRoutes = require('./routes/payment');
app.use('/', paymentRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;