const express = require('express');
const router = express.Router();
const path = require('path');
const { getGenerations, getGenerationsCount, getTopUsers, getStats, savePushSubscription, removePushSubscription, getAnalyticsEvents, getDeviceAnalyticsEvents, getAnalyticsDailySummary, getAnalyticsStats, getModelVotes, getVotesTodayTotal, setDeviceExcludedFromStats, setPushPreference, getPushPreferences } = require('../services/database');
const { getVapidPublicKey } = require('../services/pushService');
const { addClient, getRecentLogs } = require('../services/logBroadcaster');
const { adminAuth, adminLogin, adminCheck } = require('../middleware/adminAuth');
const adminChatRoute = require('./adminChat');

// --- Public routes (no auth) ---

// Login page
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'login.html'));
});

// Login API
router.post('/login', adminLogin);

// Auth check
router.get('/auth-check', adminCheck);

// PWA manifest
router.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'manifest.json'));
});

// Service worker (must be served at /admin/ scope)
router.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/admin/');
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'sw.js'));
});

// --- Protected routes (require auth) ---
router.use(adminAuth);

// Landing page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// Dashboard
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'dashboard.html'));
});

// Chat admin UI
router.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'chat.html'));
});

// Chat API routes (under /admin/api/chat to avoid conflict with /admin/chat page)
router.use('/api/chat', adminChatRoute);

// API: Get generations list (paginated)
router.get('/api/generations', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const generations = getGenerations({ limit, offset });
  const total = getGenerationsCount();
  res.json({ generations, total, limit, offset });
});

// API: Get stats
router.get('/api/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

// API: Get top users by generation count
router.get('/api/top-users', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const users = getTopUsers({ limit });
  res.json({ users });
});

// API: Get recent logs (non-streaming)
router.get('/api/logs', (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 100, 500);
  const logs = getRecentLogs(count);
  res.json({ logs });
});

// Analytics page
router.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'analytics.html'));
});

// API: Analytics stats
router.get('/api/analytics/stats', (req, res) => {
  const stats = getAnalyticsStats();
  stats.votesTodayTotal = getVotesTodayTotal();
  res.json(stats);
});

// API: Analytics events (paginated, filterable)
router.get('/api/analytics/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const date = req.query.date || null;
  const eventType = req.query.event_type || null;
  const result = getAnalyticsEvents({ date, eventType, limit, offset });
  res.json({ ...result, limit, offset });
});

// API: Device analytics history
router.get('/api/analytics/device/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  const { events, firstName, excludedFromStats } = getDeviceAnalyticsEvents(deviceId);
  res.json({ deviceId, firstName, excludedFromStats, events });
});

// API: Toggle device exclusion from stats (logs stay visible, counts are filtered)
router.post('/api/analytics/device/:deviceId/exclude', (req, res) => {
  const { deviceId } = req.params;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
  const excluded = !!req.body?.excluded;
  setDeviceExcludedFromStats(deviceId, excluded);
  res.json({ ok: true, deviceId, excluded });
});

// API: Analytics daily summary
router.get('/api/analytics/daily', (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 14, 90);
  const summary = getAnalyticsDailySummary({ days });
  res.json({ summary });
});

// API: Model votes
router.get('/api/votes', (req, res) => {
  const votes = getModelVotes();
  res.json({ votes });
});

// Push: Get VAPID public key (no auth needed for service worker registration)
router.get('/api/push/vapid-key', (req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(404).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// Push: Save subscription (optional preferences override defaults / existing flags)
router.post('/api/push/subscribe', (req, res) => {
  try {
    const { subscription, preferences } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    savePushSubscription(subscription, preferences || {});
    const prefs = getPushPreferences(subscription.endpoint);
    res.json({ ok: true, preferences: prefs });
  } catch (e) {
    console.error('[Push] Subscribe error:', e.message);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Push: Get preferences for an endpoint
router.get('/api/push/preferences', (req, res) => {
  try {
    const endpoint = req.query.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const prefs = getPushPreferences(endpoint);
    if (!prefs) return res.json({ exists: false });
    res.json({ exists: true, preferences: prefs });
  } catch (e) {
    console.error('[Push] Preferences error:', e.message);
    res.status(500).json({ error: 'Failed to read preferences' });
  }
});

// Push: Update preference for a category (chat | show_created)
router.post('/api/push/preferences', (req, res) => {
  try {
    const { endpoint, category, enabled } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    if (!category || !['chat', 'show_created'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const ok = setPushPreference(endpoint, category, !!enabled);
    if (!ok) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ ok: true, preferences: getPushPreferences(endpoint) });
  } catch (e) {
    console.error('[Push] Preference update error:', e.message);
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

// Push: Remove subscription
router.post('/api/push/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    removePushSubscription(endpoint);
    res.json({ ok: true });
  } catch (e) {
    console.error('[Push] Unsubscribe error:', e.message);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// SSE: Stream logs in real-time
router.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');
  addClient(res);
});

module.exports = router;
