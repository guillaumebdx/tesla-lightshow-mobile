const express = require('express');
const router = express.Router();
const { voteForModel, getDeviceVotes } = require('../services/database');

const VALID_MODELS = ['model_s', 'model_x', 'cybertruck'];

// POST /api/votes — Vote for a car model
router.post('/', (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Missing X-Device-Id header' });

    const { carModel } = req.body;
    if (!carModel || !VALID_MODELS.includes(carModel)) {
      return res.status(400).json({ error: 'Invalid car model' });
    }

    const result = voteForModel(deviceId, carModel);
    res.json({ ok: true, alreadyVoted: result.alreadyVoted });
  } catch (e) {
    console.error('[Votes] Error:', e.message);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// GET /api/votes — Get this device's votes
router.get('/', (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'Missing X-Device-Id header' });

    const votes = getDeviceVotes(deviceId);
    res.json({ votes });
  } catch (e) {
    console.error('[Votes] Fetch error:', e.message);
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

module.exports = router;
