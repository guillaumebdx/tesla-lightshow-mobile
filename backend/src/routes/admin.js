const express = require('express');
const router = express.Router();
const path = require('path');
const { getGenerations, getGenerationsCount, getTopUsers, getStats } = require('../services/database');
const { addClient, getRecentLogs } = require('../services/logBroadcaster');

// Serve dashboard UI
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'dashboard.html'));
});

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
