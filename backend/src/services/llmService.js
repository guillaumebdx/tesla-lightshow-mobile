const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('../systemPrompt');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const isDev = process.env.NODE_ENV === 'development';
const log = (msg) => isDev && console.log(`  [LLM] ${msg}`);

// Model config — change in .env to test different models
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_TOKENS_MAP = {
  'gpt-4o-mini': 16384,
  'gpt-4o': 16384,
  'gpt-4.1-mini': 32768,
  'gpt-4.1': 32768,
  'gpt-4.1-nano': 16384,
};
const MAX_TOKENS = MAX_TOKENS_MAP[MODEL] || 16384;

// Pricing per million tokens (input, output) — for cost estimation in logs
const PRICING_MAP = {
  'gpt-4o-mini':  { input: 0.15,  output: 0.60  },
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4.1-mini': { input: 0.40,  output: 1.60  },
  'gpt-4.1':      { input: 2.00,  output: 8.00  },
  'gpt-4.1-nano': { input: 0.10,  output: 0.40  },
};
const PRICING = PRICING_MAP[MODEL] || { input: 2.00, output: 8.00 };

log(`🔧 Model: ${MODEL} | max_tokens: ${MAX_TOKENS} | pricing: $${PRICING.input}/$${PRICING.output} per M tokens`);

async function generateLightShow({ waveform, durationMs, mood, trackTitle }) {
  log('📝 Building user prompt...');
  const { prompt: userPrompt, analysis } = buildUserPrompt({ waveform, durationMs, mood, trackTitle });
  log(`📝 Prompt built (${userPrompt.length} chars)`);
  log(`📝 System prompt: ${SYSTEM_PROMPT.length} chars`);
  log(`🎵 Music analysis: ${analysis.beats} beats, ${analysis.peaks} peak sections, ${analysis.drops} drops, ${analysis.rises} rises`);

  const startTime = Date.now();
  log(`🌐 Sending request to OpenAI API (${MODEL})...`);

  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.65,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const elapsed = Date.now() - startTime;
  const usage = response.usage;
  log(`⏱  OpenAI responded in ${elapsed}ms`);
  log(`📊 Tokens: ${usage?.prompt_tokens} prompt + ${usage?.completion_tokens} completion = ${usage?.total_tokens} total`);
  log(`💰 Estimated cost: ~$${((usage?.prompt_tokens * PRICING.input + usage?.completion_tokens * PRICING.output) / 1000000).toFixed(4)}`);

  const finishReason = response.choices[0]?.finish_reason;
  log(`🏁 Finish reason: ${finishReason}`);
  if (finishReason === 'length') {
    log('⚠️  OUTPUT WAS TRUNCATED — LLM hit max_tokens limit!');
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }
  log(`📦 Response content: ${content.length} chars`);

  log('🔍 Parsing JSON...');
  const parsed = JSON.parse(content);

  if (!parsed.events || !Array.isArray(parsed.events)) {
    log(`❌ Invalid response structure: keys = ${Object.keys(parsed).join(', ')}`);
    throw new Error('LLM JSON missing events array');
  }
  log(`📋 Raw events from LLM: ${parsed.events.length}`);

  // Diagnose time distribution before sanitization
  const rawStarts = parsed.events.map(e => e.startMs).filter(t => typeof t === 'number');
  const rawEnds = parsed.events.map(e => e.endMs).filter(t => typeof t === 'number');
  if (rawStarts.length > 0) {
    const minStart = Math.min(...rawStarts);
    const maxEnd = Math.max(...rawEnds);
    const coverage = ((maxEnd / durationMs) * 100).toFixed(1);
    log(`⏱  Time range: ${minStart}ms → ${maxEnd}ms (covers ${coverage}% of ${durationMs}ms track)`);

    // Segment coverage check
    const segSize = 10000;
    const numSegs = Math.ceil(durationMs / segSize);
    const segCounts = new Array(numSegs).fill(0);
    parsed.events.forEach(e => {
      if (typeof e.startMs === 'number') {
        const seg = Math.min(Math.floor(e.startMs / segSize), numSegs - 1);
        segCounts[seg]++;
      }
    });
    const emptySegs = segCounts.filter(c => c === 0).length;
    log(`📊 Segment coverage (${segSize/1000}s each): ${segCounts.join(', ')}`);
    if (emptySegs > 0) log(`⚠️  ${emptySegs} empty segments!`);
  }

  // Post-process: validate and sanitize events
  log('🧹 Sanitizing events...');
  const events = sanitizeEvents(parsed.events, durationMs);
  log(`✅ After sanitization: ${events.length} valid events (removed ${parsed.events.length - events.length})`);

  // Part breakdown
  const partCounts = {};
  events.forEach(e => { partCounts[e.part] = (partCounts[e.part] || 0) + 1; });
  log('📊 Part breakdown:');
  Object.entries(partCounts).sort((a, b) => b[1] - a[1]).forEach(([part, count]) => {
    log(`   ${part}: ${count}`);
  });

  // Compute coverage
  let coveragePercent = 0;
  let segmentCoverageStr = '';
  if (rawStarts.length > 0) {
    const maxEnd = Math.max(...rawEnds);
    coveragePercent = parseFloat(((maxEnd / durationMs) * 100).toFixed(1));
    const segSize = 10000;
    const numSegs = Math.ceil(durationMs / segSize);
    const segCounts = new Array(numSegs).fill(0);
    events.forEach(e => {
      const seg = Math.min(Math.floor(e.startMs / segSize), numSegs - 1);
      segCounts[seg]++;
    });
    segmentCoverageStr = segCounts.join(',');
  }

  const estimatedCost = (usage?.prompt_tokens * PRICING.input + usage?.completion_tokens * PRICING.output) / 1000000;

  return {
    events,
    meta: {
      model: MODEL,
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      estimatedCost,
      eventsCount: events.length,
      eventsRemoved: parsed.events.length - events.length,
      coveragePercent,
      finishReason,
      responseTimeMs: elapsed,
      beatsDetected: analysis.beats,
      peaksDetected: analysis.peaks,
      dropsDetected: analysis.drops,
      risesDetected: analysis.rises,
      segmentCoverage: segmentCoverageStr,
      partBreakdown: JSON.stringify(partCounts),
    },
  };
}

/**
 * Build the user prompt with waveform energy timeline, beat detection, and musical analysis.
 */
function buildUserPrompt({ waveform, durationMs, mood, trackTitle }) {
  const durationSec = (durationMs / 1000).toFixed(1);
  const sampleIntervalMs = Math.round(durationMs / waveform.length);
  const totalSeconds = Math.ceil(durationMs / 1000);

  // 1. Build per-second energy timeline
  const energyPerSecond = [];
  for (let s = 0; s < totalSeconds; s++) {
    const startIdx = Math.floor(s * 1000 / sampleIntervalMs);
    const endIdx = Math.min(Math.floor((s + 1) * 1000 / sampleIntervalMs), waveform.length);
    let max = 0;
    for (let j = startIdx; j < endIdx; j++) {
      if (waveform[j] > max) max = waveform[j];
    }
    energyPerSecond.push(Math.round(max * 100) / 100);
  }

  // 2. Detect beats (local peaks in energy with minimum gap)
  const beats = [];
  const minBeatGapSec = 0.4; // minimum 400ms between beats
  let lastBeatSec = -1;
  for (let s = 1; s < energyPerSecond.length - 1; s++) {
    const prev = energyPerSecond[s - 1];
    const curr = energyPerSecond[s];
    const next = energyPerSecond[s + 1];
    // A beat is a local maximum above 0.2 threshold
    if (curr > prev && curr >= next && curr > 0.2 && (s - lastBeatSec) >= minBeatGapSec) {
      beats.push({ sec: s, energy: curr });
      lastBeatSec = s;
    }
  }

  // 3. Detect peaks (sustained high energy), drops (sudden decrease), rises (sudden increase)
  const peaks = [];
  const drops = [];
  const rises = [];
  for (let s = 1; s < energyPerSecond.length; s++) {
    const prev = energyPerSecond[s - 1];
    const curr = energyPerSecond[s];
    const diff = curr - prev;

    if (diff < -0.25) {
      drops.push({ sec: s, from: prev, to: curr });
    } else if (diff > 0.2) {
      rises.push({ sec: s, from: prev, to: curr });
    }
    if (curr > 0.7) {
      if (peaks.length === 0 || s - peaks[peaks.length - 1].endSec > 2) {
        peaks.push({ startSec: s, endSec: s });
      } else {
        peaks[peaks.length - 1].endSec = s;
      }
    }
  }

  // 4. Target events
  const targetEvents = Math.min(480, Math.max(80, Math.round(durationMs / 1000 * 3)));

  // 5. Build the prompt
  const energyLine = energyPerSecond.map((v, i) => `${i}s:${v.toFixed(2)}`).join(' ');

  const beatLine = beats.length > 0
    ? beats.map(b => `${b.sec}s(${b.energy.toFixed(2)})`).join(', ')
    : 'no clear beats detected — use waveform energy for timing';

  const peakLine = peaks.length > 0
    ? peaks.map(p => p.startSec === p.endSec ? `${p.startSec}s` : `${p.startSec}-${p.endSec}s`).join(', ')
    : 'no sustained peaks';

  const dropLine = drops.length > 0
    ? drops.map(d => `${d.sec}s(${d.from.toFixed(2)}→${d.to.toFixed(2)})`).join(', ')
    : 'no sharp drops';

  const riseLine = rises.length > 0
    ? rises.map(r => `${r.sec}s(${r.from.toFixed(2)}→${r.to.toFixed(2)})`).join(', ')
    : 'no sharp rises';

  const prompt = `Create a light show for "${trackTitle}" (${durationSec}s, mood: ${mood || 'auto'}).
Generate ${targetEvents} events (minimum ${Math.round(targetEvents * 0.7)}).

# ENERGY TIMELINE (amplitude per second, 0.00=silence, 1.00=max)
${energyLine}

# DETECTED BEATS (place events on these timestamps)
${beatLine}

# PEAK SECTIONS (high energy — use strobes, all-on, blink speed 2)
${peakLine}

# DROPS (sudden energy decrease — use for dramatic pauses or full flash)
${dropLine}

# RISES (energy building — use chase patterns, blink escalation)
${riseLine}

# INSTRUCTIONS
- Place events precisely ON the beat timestamps above
- Between beats, use the energy level to decide intensity
- Energy > 0.6: strobe blast, left-right ping-pong, blink speed 2
- Energy 0.3-0.6: wave patterns, headlight pulse, blink speed 0-1
- Energy < 0.3: breathing, single lights with easeIn, or silence
- Events from 0ms to ${durationMs}ms — cover the FULL track
- Keep events SHORT: 300-2000ms for lights, match to beat spacing
- Use blink effect generously for rhythmic sections
- Include closures: 4 windows, trunk sequence, flap sequence, retro roundtrips on peaks`;

  return {
    prompt,
    analysis: {
      beats: beats.length,
      peaks: peaks.length,
      drops: drops.length,
      rises: rises.length,
    },
  };
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
