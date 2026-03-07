require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initFirebaseAdmin, verifyAppCheck } = require('./middleware/appCheck');
const generateShowRoute = require('./routes/generateShow');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase Admin SDK
initFirebaseAdmin();

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting: 20 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Routes (App Check protected)
app.use('/api/generate-show', verifyAppCheck, generateShowRoute);

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 LightShow Studio API running on port ${PORT}`);
});
