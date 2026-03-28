require('dotenv').config();

// Load log broadcaster FIRST so it captures all subsequent console.log calls
require('./services/logBroadcaster');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initFirebaseAdmin, verifyAppCheck } = require('./middleware/appCheck');
const { initPush } = require('./services/pushService');
const generateShowRoute = require('./routes/generateShow');
const adminRoute = require('./routes/admin');
const chatRoute = require('./routes/chat');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Initialize Firebase Admin SDK
initFirebaseAdmin();

// Initialize Web Push
initPush();

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting: 40 requests per 15 minutes per IP (AI generation)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/generate-show', limiter);

// Rate limiting for chat SEND only (POST) — polling GETs are unlimited
const chatSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages, please slow down.' },
});
app.post('/api/chat/messages', chatSendLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Admin (auth handled inside the router)
app.use('/admin', adminRoute);

// Routes (App Check protected)
app.use('/api/generate-show', verifyAppCheck, generateShowRoute);

// Chat routes — no App Check (secured by device ID + rate limiting)
app.use('/api/chat', chatRoute);

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 LightShow Studio API running on port ${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
});
