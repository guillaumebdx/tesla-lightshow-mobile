const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('../systemPrompt');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Call GPT-4o mini to generate a light show from waveform data.
 * @param {Object} params
 * @param {number[]} params.waveform - Downsampled amplitude values (0-1)
 * @param {number} params.durationMs - Track duration in ms
 * @param {string} params.mood - Mood descriptor
 * @param {string} params.trackTitle - Track title for context
 * @returns {Promise<{events: Object[]}>}
 */
async function generateLightShow({ waveform, durationMs, mood, trackTitle }) {
  const userPrompt = buildUserPrompt({ waveform, durationMs, mood, trackTitle });

  console.log(`[LLM] Generating show: "${trackTitle}" (${durationMs}ms, mood: ${mood}, ${waveform.length} samples)`);
  const startTime = Date.now();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 16000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const elapsed = Date.now() - startTime;
  const usage = response.usage;
  console.log(`[LLM] Done in ${elapsed}ms — tokens: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out`);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const parsed = JSON.parse(content);

  if (!parsed.events || !Array.isArray(parsed.events)) {
    throw new Error('LLM JSON missing events array');
  }

  // Post-process: validate and sanitize events
  const events = sanitizeEvents(parsed.events, durationMs);

  console.log(`[LLM] Generated ${events.length} events for "${trackTitle}"`);

  return { events };
}

/**
 * Build the user prompt with waveform analysis summary.
 */
function buildUserPrompt({ waveform, durationMs, mood, trackTitle }) {
  const durationSec = (durationMs / 1000).toFixed(1);
  const sampleIntervalMs = Math.round(durationMs / waveform.length);

  // Compute basic stats for the LLM
  const avg = waveform.reduce((a, b) => a + b, 0) / waveform.length;
  const max = Math.max(...waveform);
  const min = Math.min(...waveform);

  // Find peak sections (top 20% amplitude moments)
  const threshold = avg + (max - avg) * 0.5;
  const peaks = [];
  for (let i = 0; i < waveform.length; i++) {
    if (waveform[i] >= threshold) {
      const timeMs = Math.round(i * sampleIntervalMs);
      peaks.push(timeMs);
    }
  }

  // Cluster peaks into sections
  const peakSections = clusterPeaks(peaks, 3000);

  return `Generate a Tesla light show for this track:

**Track:** "${trackTitle}"
**Duration:** ${durationSec}s (${durationMs}ms)
**Mood:** ${mood}

**Waveform data** (${waveform.length} samples, one every ${sampleIntervalMs}ms, values 0.0 to 1.0):
[${waveform.join(',')}]

**Waveform stats:**
- Average amplitude: ${avg.toFixed(3)}
- Peak amplitude: ${max.toFixed(3)}
- Quiet sections (< 0.15): look for these in the data for pauses/transitions

**High-energy sections** (timestamps in ms where amplitude exceeds ${threshold.toFixed(2)}):
${peakSections.map(s => `- ${s.startMs}ms to ${s.endMs}ms`).join('\n')}

Generate the light show events as JSON. Remember:
- Aim for 300-480 events
- Cover the full ${durationSec}s duration
- Synchronize intensity to the waveform peaks
- All 4 windows must dance (10s+ each)
- Include trunk open→dance→close sequence
- Include flap open→rainbow→close sequence (3 events max)
- Include retro roundtrips at peak moments
- Use varied patterns: waves, alternating, strobes, solid blocks
- End with a fade-out (easeOut on the final events)`;
}

/**
 * Cluster nearby peak timestamps into sections.
 */
function clusterPeaks(peaks, gapMs) {
  if (peaks.length === 0) return [];
  const sections = [];
  let start = peaks[0];
  let end = peaks[0];
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i] - end <= gapMs) {
      end = peaks[i];
    } else {
      sections.push({ startMs: start, endMs: end });
      start = peaks[i];
      end = peaks[i];
    }
  }
  sections.push({ startMs: start, endMs: end });
  return sections;
}

/**
 * Sanitize and validate events from LLM output.
 */
function sanitizeEvents(events, durationMs) {
  const VALID_PARTS = [
    'light_left_front', 'light_right_front', 'light_left_back', 'light_right_back',
    'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right',
    'side_repeater_left', 'side_repeater_right', 'license_plate', 'brake_lights', 'rear_fog',
    'window_left_front', 'window_right_front', 'window_left_back', 'window_right_back',
    'retro_left', 'retro_right', 'trunk', 'flap',
  ];

  const VALID_EFFECTS = ['solid', 'blink'];
  const VALID_RETRO = ['close', 'open', 'roundtrip'];
  const VALID_TRUNK = ['trunk_open', 'trunk_close', 'trunk_dance'];
  const VALID_FLAP = ['flap_open', 'flap_close', 'flap_rainbow'];

  return events
    .filter(e => {
      if (!e.part || !VALID_PARTS.includes(e.part)) return false;
      if (typeof e.startMs !== 'number' || typeof e.endMs !== 'number') return false;
      if (e.startMs >= e.endMs) return false;
      return true;
    })
    .map((e, i) => ({
      id: `ai_${i + 1}`,
      part: e.part,
      startMs: Math.max(0, Math.round(e.startMs)),
      endMs: Math.min(durationMs, Math.round(e.endMs)),
      effect: VALID_EFFECTS.includes(e.effect) ? e.effect : 'solid',
      power: 100,
      blinkSpeed: [0, 1, 2].includes(e.blinkSpeed) ? e.blinkSpeed : 0,
      easeIn: !!e.easeIn,
      easeOut: !!e.easeOut,
      retroMode: VALID_RETRO.includes(e.retroMode) ? e.retroMode : 'roundtrip',
      windowMode: 'window_dance',
      windowDurationMs: Math.max(10000, Math.min(30000, e.windowDurationMs || 10000)),
      trunkMode: VALID_TRUNK.includes(e.trunkMode) ? e.trunkMode : 'trunk_open',
      flapMode: VALID_FLAP.includes(e.flapMode) ? e.flapMode : 'flap_open',
    }))
    .slice(0, 500) // Hard limit
    .sort((a, b) => a.startMs - b.startMs);
}

module.exports = { generateLightShow };
