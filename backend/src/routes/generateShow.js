const express = require('express');
const router = express.Router();
const { generateLightShow } = require('../services/llmService');

/**
 * POST /api/generate-show
 * Body: {
 *   waveform: number[],       // amplitude values 0-1
 *   durationMs: number,       // track duration in ms
 *   mood?: string,            // optional: "intense", "chill", "spooky", "epic", "festive", "romantic"
 *   trackTitle?: string,      // optional: track name for context
 * }
 * Response: { events: [...] }
 */
router.post('/', async (req, res) => {
  try {
    const { waveform, durationMs, mood, trackTitle } = req.body;

    // Validation
    if (!waveform || !Array.isArray(waveform) || waveform.length === 0) {
      return res.status(400).json({ error: 'waveform is required (array of amplitudes)' });
    }
    if (!durationMs || typeof durationMs !== 'number' || durationMs < 5000) {
      return res.status(400).json({ error: 'durationMs is required (minimum 5000ms)' });
    }
    if (durationMs > 300000) {
      return res.status(400).json({ error: 'durationMs too long (max 5 minutes)' });
    }

    // Downsample waveform to ~200 points to reduce token count
    const downsampled = downsampleWaveform(waveform, 200);

    const result = await generateLightShow({
      waveform: downsampled,
      durationMs,
      mood: mood || 'auto',
      trackTitle: trackTitle || 'Unknown Track',
    });

    res.json(result);
  } catch (err) {
    console.error('[generateShow] Error:', err.message);
    if (err.message.includes('JSON')) {
      return res.status(502).json({ error: 'LLM returned invalid response, please retry' });
    }
    res.status(500).json({ error: 'Failed to generate light show' });
  }
});

/**
 * Downsample a waveform array to targetLength points using peak-hold.
 * Keeps the maximum value in each bucket so peaks are preserved.
 */
function downsampleWaveform(waveform, targetLength) {
  if (waveform.length <= targetLength) return waveform;

  const bucketSize = waveform.length / targetLength;
  const result = [];
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    let max = 0;
    for (let j = start; j < end && j < waveform.length; j++) {
      if (waveform[j] > max) max = waveform[j];
    }
    result.push(Math.round(max * 1000) / 1000);
  }
  return result;
}

module.exports = router;
