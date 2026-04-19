const express = require('express');
const router = express.Router();
const { insertAnalyticsEvents, getPushSubscriptionsForCategory, removePushSubscription, getDeviceName, isDeviceExcludedFromStats } = require('../services/database');
const { sendPush } = require('../services/pushService');

const VALID_EVENT_TYPES = ['show_created', 'fseq_exported', 'music_selected', 'demo_show_created'];

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

    // Push admin notifications for show_created events (async — don't block response).
    // Excluded devices don't trigger notifications either (they're hidden from stats
    // so the admin isn't interested in their activity).
    const showCreatedEvents = validated.filter(e => e.eventType === 'show_created');
    if (showCreatedEvents.length > 0 && !isDeviceExcludedFromStats(deviceId)) {
      setImmediate(async () => {
        try {
          const subs = getPushSubscriptionsForCategory('show_created');
          if (subs.length === 0) return;
          const firstName = getDeviceName(deviceId) || deviceId.slice(0, 8);
          const count = showCreatedEvents.length;
          const payload = {
            title: count > 1 ? `🎆 ${count} new shows` : '🎆 New show created',
            body: `${firstName} just created a show`,
            badge: count,
            data: { url: '/admin/analytics', category: 'show_created' },
          };
          for (const sub of subs) {
            const ok = await sendPush(sub, payload);
            if (!ok) removePushSubscription(sub.endpoint);
          }
        } catch (err) {
          console.error('[Analytics] Push notify error:', err.message);
        }
      });
    }
  } catch (e) {
    console.error('[Analytics] Insert error:', e.message);
    res.status(500).json({ error: 'Failed to insert events' });
  }
});

module.exports = router;
