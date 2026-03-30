const express = require('express');
const router = express.Router();
const { insertAnalyticsEvents } = require('../services/database');

const VALID_EVENT_TYPES = ['show_created', 'fseq_exported', 'music_selected'];

// POST /api/analytics — Batch insert analytics events
router.post('/', (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Missing X-Device-Id header' });

    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array required' });
    }
    if (events.length > 50) {
      return res.status(400).json({ error: 'Max 50 events per batch' });
    }

    const validated = [];
    for (const e of events) {
      if (!e.eventType || !VALID_EVENT_TYPES.includes(e.eventType)) continue;
      validated.push({
        deviceId,
        eventType: e.eventType,
        metadata: e.metadata || {},
        timestamp: e.timestamp || null,
      });
    }

    if (validated.length > 0) {
      insertAnalyticsEvents(validated);
    }

    res.json({ ok: true, inserted: validated.length });
  } catch (e) {
    console.error('[Analytics] Insert error:', e.message);
    res.status(500).json({ error: 'Failed to insert events' });
  }
});

module.exports = router;
