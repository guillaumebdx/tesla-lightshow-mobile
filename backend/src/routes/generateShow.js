const express = require('express');
const router = express.Router();
const { generateLightShow } = require('../services/llmService');
const db = require('../services/database');

/**
 * POST /api/generate-show
 * Body: {
 *   waveform: number[],       // amplitude values 0-1
 *   durationMs: number,       // track duration in ms
 *   mood?: string,            // optional: "intense", "chill", "spooky", "epic", "festive", "romantic"
 *   trackTitle?: string,      // optional: track name for context
 *   userPrompt?: string,      // optional: user description of desired show style (max 500 chars)
 * }
 * Response: { events: [...] }
 */
router.post('/', async (req, res) => {
  const isDev = process.env.NODE_ENV === 'development';
  const reqId = Date.now().toString(36);
  const log = (msg) => isDev && console.log(`[${reqId}] ${msg}`);
  let dbId;

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📥 New generate-show request received');

  try {
    const { waveform, durationMs, mood, trackTitle, userPrompt } = req.body;

    log(`🎵 Track: "${trackTitle}"`);
    log(`⏱  Duration: ${durationMs}ms (${(durationMs/1000).toFixed(1)}s)`);
    log(`🎭 Mood: ${mood || 'auto'}`);
    log(`📊 Waveform: ${waveform?.length || 0} samples`);
    const deviceId = req.headers['x-device-id'] || '';
    log(`💬 User prompt: ${userPrompt ? `"${userPrompt}" (${userPrompt.length} chars)` : 'none'}`);
    log(`👤 Device ID: ${deviceId || 'none'}`);

    // Validation
    if (!waveform || !Array.isArray(waveform) || waveform.length === 0) {
      log('❌ Validation failed: waveform missing or empty');
      return res.status(400).json({ error: 'waveform is required (array of amplitudes)' });
    }
    if (!durationMs || typeof durationMs !== 'number' || durationMs < 5000) {
      log(`❌ Validation failed: durationMs=${durationMs} (min 5000)`);
      return res.status(400).json({ error: 'durationMs is required (minimum 5000ms)' });
    }
    if (durationMs > 600000) {
      log(`❌ Validation failed: durationMs=${durationMs} > 600000`);
      return res.status(400).json({ error: 'durationMs too long (max 10 minutes)' });
    }
    // Validate userPrompt length
    const sanitizedUserPrompt = (typeof userPrompt === 'string' && userPrompt.trim())
      ? userPrompt.trim().slice(0, 500)
      : undefined;
    log('✅ Validation passed');

    // Downsample waveform to ~200 points to reduce token count
    const downsampled = downsampleWaveform(waveform, 500);
    log(`📉 Waveform downsampled: ${waveform.length} → ${downsampled.length} samples`);

    // Create DB record at start
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const dbId = db.createGeneration({
      requestId: reqId,
      trackTitle: trackTitle || 'Unknown Track',
      durationMs,
      mood: mood || 'auto',
      model,
      ipAddress: req.ip,
      deviceId,
    });
    log(`💾 DB record #${dbId} created`);

    log('🤖 Calling LLM...');
    const startTime = Date.now();

    const result = await generateLightShow({
      waveform: downsampled,
      durationMs,
      mood: mood || 'auto',
      trackTitle: trackTitle || 'Unknown Track',
      userPrompt: sanitizedUserPrompt,
    });

    const elapsed = Date.now() - startTime;
    log(`✅ LLM responded in ${elapsed}ms`);
    log(`🎯 Generated ${result.events.length} events`);

    // Persist results to DB
    db.completeGeneration(dbId, result.meta);
    log('� Generation saved to DB');

    log('�� Sending response to client');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    res.json({ events: result.events });
  } catch (err) {
    log(`💥 ERROR: ${err.message}`);
    console.error('[generateShow] Error:', err.message);
    // Try to mark DB record as failed
    try { if (dbId) db.failGeneration(dbId, err.message); } catch {}
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
