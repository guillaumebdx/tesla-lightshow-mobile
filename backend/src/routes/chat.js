const express = require('express');
const router = express.Router();
const { getOrCreateConversation, addMessage, getMessages, getConversationStatus, markReadByUser } = require('../services/database');

// POST /api/chat/messages — User sends a message
router.post('/messages', (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Missing X-Device-Id header' });

    const { content, deviceInfo } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars)' });

    // Create conversation if first message, update device info
    getOrCreateConversation(deviceId, deviceInfo || null);

    const msgId = addMessage(deviceId, 'user', content.trim());
    res.json({ ok: true, messageId: msgId });
  } catch (e) {
    console.error('[Chat] Send error:', e.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/chat/messages?since_id=123 — User fetches messages (since_id = last seen msg ID)
router.get('/messages', (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Missing X-Device-Id header' });

    const sinceId = req.query.since_id ? parseInt(req.query.since_id, 10) : null;
    const messages = getMessages(deviceId, sinceId);

    // Mark as read by user
    markReadByUser(deviceId);

    res.json({ messages });
  } catch (e) {
    console.error('[Chat] Fetch error:', e.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET /api/chat/status — Lightweight poll for unread count
router.get('/status', (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Missing X-Device-Id header' });

    const status = getConversationStatus(deviceId);
    if (!status) return res.json({ exists: false, unread: 0 });

    res.json({ exists: true, unread: status.unread_user, status: status.status });
  } catch (e) {
    console.error('[Chat] Status error:', e.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

module.exports = router;
