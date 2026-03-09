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

async function generateLightShow({ waveform, durationMs, mood, trackTitle, userPrompt: rawUserPrompt }) {
  log('📝 Building user prompt...');
  const { prompt: basePrompt, analysis } = buildUserPrompt({ waveform, durationMs, mood, trackTitle });

  // Append user's custom description if provided (already validated/trimmed by route)
  let finalPrompt = basePrompt;
  if (rawUserPrompt) {
    finalPrompt += `\n\n# USER'S CREATIVE DIRECTION (follow this closely)\n${rawUserPrompt}`;
    log(`� User prompt appended (${rawUserPrompt.length} chars): "${rawUserPrompt}"`);
  }

  log(`�📝 Prompt built (${finalPrompt.length} chars)`);
  log(`📝 System prompt: ${SYSTEM_PROMPT.length} chars`);
  log(`🎵 Music analysis: ${analysis.beats} beats (${analysis.strongBeats} strong), ~${analysis.bpm} BPM, ${analysis.peaks} peaks, ${analysis.drops} drops, ${analysis.rises} rises, ${analysis.sections} sections [${analysis.sectionTypes}]`);

  const startTime = Date.now();
  log(`🌐 Sending request to OpenAI API (${MODEL})...`);

  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.65,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: finalPrompt },
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
      strongBeats: analysis.strongBeats,
      estimatedBPM: analysis.bpm,
      peaksDetected: analysis.peaks,
      dropsDetected: analysis.drops,
      risesDetected: analysis.rises,
      sectionsDetected: analysis.sections,
      sectionTypes: analysis.sectionTypes,
      segmentCoverage: segmentCoverageStr,
      partBreakdown: JSON.stringify(partCounts),
    },
  };
}

/**
 * Build the user prompt with rich musical analysis:
 * - Fine energy grid (200ms windows) for sub-beat precision
 * - BPM estimation and beat grid in ms
 * - Song section detection (intro/verse/chorus/bridge/outro)
 * - Peak/drop/rise moments with ms precision
 */
function buildUserPrompt({ waveform, durationMs, mood, trackTitle }) {
  const durationSec = (durationMs / 1000).toFixed(1);
  const sampleIntervalMs = Math.round(durationMs / waveform.length);

  // ─── 1. Fine-grained energy grid (200ms windows) ───
  const WINDOW_MS = 200;
  const numWindows = Math.ceil(durationMs / WINDOW_MS);
  const energyGrid = [];
  for (let w = 0; w < numWindows; w++) {
    const startIdx = Math.floor(w * WINDOW_MS / sampleIntervalMs);
    const endIdx = Math.min(Math.floor((w + 1) * WINDOW_MS / sampleIntervalMs), waveform.length);
    let max = 0;
    for (let j = startIdx; j < endIdx; j++) {
      if (waveform[j] > max) max = waveform[j];
    }
    energyGrid.push(Math.round(max * 100) / 100);
  }

  // Also build per-second energy for section detection
  const totalSeconds = Math.ceil(durationMs / 1000);
  const energyPerSecond = [];
  for (let s = 0; s < totalSeconds; s++) {
    const wStart = Math.floor(s * 1000 / WINDOW_MS);
    const wEnd = Math.min(Math.floor((s + 1) * 1000 / WINDOW_MS), energyGrid.length);
    let sum = 0, count = 0;
    for (let w = wStart; w < wEnd; w++) { sum += energyGrid[w]; count++; }
    energyPerSecond.push(count > 0 ? Math.round((sum / count) * 100) / 100 : 0);
  }

  // ─── 2. Beat detection with BPM estimation ───
  // Detect onsets: significant energy increases in 200ms windows
  const onsets = [];
  for (let w = 1; w < energyGrid.length; w++) {
    const diff = energyGrid[w] - energyGrid[w - 1];
    if (diff > 0.08 && energyGrid[w] > 0.15) {
      const ms = w * WINDOW_MS;
      if (onsets.length === 0 || ms - onsets[onsets.length - 1].ms > 200) {
        onsets.push({ ms, energy: energyGrid[w] });
      }
    }
  }

  // Estimate BPM from onset intervals
  let estimatedBPM = 120; // fallback
  if (onsets.length > 4) {
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
      const gap = onsets[i].ms - onsets[i - 1].ms;
      if (gap > 200 && gap < 2000) intervals.push(gap);
    }
    if (intervals.length > 2) {
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      estimatedBPM = Math.round(60000 / median);
      // Normalize to reasonable range
      if (estimatedBPM > 200) estimatedBPM = Math.round(estimatedBPM / 2);
      if (estimatedBPM < 60) estimatedBPM = Math.round(estimatedBPM * 2);
    }
  }
  const beatIntervalMs = Math.round(60000 / estimatedBPM);

  // Build a regular beat grid aligned to estimated BPM
  const beatGrid = [];
  // Find first strong onset to align grid
  const firstStrongOnset = onsets.find(o => o.energy > 0.3);
  const gridStart = firstStrongOnset ? firstStrongOnset.ms % beatIntervalMs : 0;
  for (let ms = gridStart; ms < durationMs; ms += beatIntervalMs) {
    // Find closest onset to this grid point
    const nearby = onsets.find(o => Math.abs(o.ms - ms) < beatIntervalMs * 0.3);
    beatGrid.push({
      ms: nearby ? nearby.ms : Math.round(ms),
      energy: nearby ? nearby.energy : energyGrid[Math.min(Math.floor(ms / WINDOW_MS), energyGrid.length - 1)] || 0,
      strong: nearby ? nearby.energy > 0.5 : false,
    });
  }

  // ─── 3. Song section detection ───
  // Use 4-second windows to detect energy shifts
  const SECTION_WINDOW = 4;
  const sectionEnergies = [];
  for (let s = 0; s < totalSeconds; s += SECTION_WINDOW) {
    const end = Math.min(s + SECTION_WINDOW, totalSeconds);
    let sum = 0, count = 0;
    for (let i = s; i < end; i++) { sum += energyPerSecond[i]; count++; }
    sectionEnergies.push({ startSec: s, endSec: end, avgEnergy: count > 0 ? sum / count : 0 });
  }

  // Classify sections based on relative energy
  const overallAvg = energyPerSecond.reduce((a, b) => a + b, 0) / energyPerSecond.length;
  const sections = [];
  let currentType = null;
  let sectionStart = 0;

  for (const seg of sectionEnergies) {
    let type;
    const e = seg.avgEnergy;
    const isEarly = seg.startSec < totalSeconds * 0.1;
    const isLate = seg.startSec > totalSeconds * 0.85;

    if (isEarly && e < overallAvg * 0.8) {
      type = 'intro';
    } else if (isLate && e < overallAvg * 0.8) {
      type = 'outro';
    } else if (e > overallAvg * 1.3) {
      type = 'chorus';
    } else if (e < overallAvg * 0.5) {
      type = 'bridge';
    } else {
      type = 'verse';
    }

    if (type !== currentType) {
      if (currentType !== null) {
        sections.push({ type: currentType, startSec: sectionStart, endSec: seg.startSec });
      }
      currentType = type;
      sectionStart = seg.startSec;
    }
  }
  if (currentType !== null) {
    sections.push({ type: currentType, startSec: sectionStart, endSec: totalSeconds });
  }

  // Merge very short sections (< 4s) into neighbors
  const mergedSections = [];
  for (const sec of sections) {
    if (mergedSections.length > 0 && (sec.endSec - sec.startSec) < 4) {
      mergedSections[mergedSections.length - 1].endSec = sec.endSec;
    } else {
      mergedSections.push({ ...sec });
    }
  }

  // ─── 4. Detect peaks, drops, rises with ms precision ───
  const peaks = [];
  const drops = [];
  const rises = [];

  for (let w = 1; w < energyGrid.length; w++) {
    const prev = energyGrid[w - 1];
    const curr = energyGrid[w];
    const diff = curr - prev;
    const ms = w * WINDOW_MS;

    if (diff < -0.20) {
      drops.push({ ms, from: prev, to: curr });
    } else if (diff > 0.15) {
      rises.push({ ms, from: prev, to: curr });
    }
  }

  // Cluster high-energy windows into peak sections
  let peakStart = -1;
  for (let w = 0; w < energyGrid.length; w++) {
    if (energyGrid[w] > 0.65) {
      if (peakStart < 0) peakStart = w * WINDOW_MS;
    } else {
      if (peakStart >= 0) {
        const peakEnd = w * WINDOW_MS;
        if (peakEnd - peakStart >= 1000) { // only peaks > 1s
          peaks.push({ startMs: peakStart, endMs: peakEnd });
        }
        peakStart = -1;
      }
    }
  }
  if (peakStart >= 0) {
    peaks.push({ startMs: peakStart, endMs: numWindows * WINDOW_MS });
  }

  // ─── 5. Compute energy variance per section for rhythmic density hint ───
  const sectionDetails = mergedSections.map(sec => {
    const wStart = Math.floor(sec.startSec * 1000 / WINDOW_MS);
    const wEnd = Math.min(Math.floor(sec.endSec * 1000 / WINDOW_MS), energyGrid.length);
    let sum = 0, count = 0;
    for (let w = wStart; w < wEnd; w++) { sum += energyGrid[w]; count++; }
    const avg = count > 0 ? sum / count : 0;
    let variance = 0;
    for (let w = wStart; w < wEnd; w++) { variance += Math.pow(energyGrid[w] - avg, 2); }
    variance = count > 0 ? variance / count : 0;
    const rhythmic = variance > 0.02; // high variance = rhythmic, low = sustained
    return { ...sec, avgEnergy: Math.round(avg * 100) / 100, rhythmic };
  });

  // ─── 6. Target events (scale with duration) ───
  const targetEvents = Math.min(480, Math.max(100, Math.round(durationMs / 1000 * 3.5)));

  // ─── 7. Build compact energy representation ───
  // Per-second is more compact but still useful; provide 200ms grid only for key sections
  const energyLine = energyPerSecond.map((v, i) => `${i}s:${v.toFixed(2)}`).join(' ');

  // Fine grid around peaks and drops (±2s around each)
  const fineGridRanges = new Set();
  [...peaks.map(p => p.startMs), ...drops.map(d => d.ms), ...rises.map(r => r.ms)].forEach(ms => {
    const wCenter = Math.floor(ms / WINDOW_MS);
    for (let w = Math.max(0, wCenter - 10); w < Math.min(numWindows, wCenter + 10); w++) {
      fineGridRanges.add(w);
    }
  });
  const fineGridEntries = [...fineGridRanges].sort((a, b) => a - b);
  const fineGridLine = fineGridEntries.length > 0
    ? fineGridEntries.map(w => `${w * WINDOW_MS}ms:${energyGrid[w].toFixed(2)}`).join(' ')
    : 'same as per-second data';

  // ─── 8. Format all data for prompt ───
  const beatLine = beatGrid.length > 0
    ? beatGrid.filter(b => b.strong).map(b => `${b.ms}ms(${b.energy.toFixed(2)})`).join(', ')
      + `\nAll beats (${estimatedBPM} BPM, every ${beatIntervalMs}ms): `
      + beatGrid.map(b => `${b.ms}`).join(',')
    : `no clear beats — estimated ~${estimatedBPM} BPM`;

  const sectionLine = sectionDetails
    .map(s => `${s.startSec}-${s.endSec}s: ${s.type.toUpperCase()} (avg energy ${s.avgEnergy}, ${s.rhythmic ? 'rhythmic' : 'sustained'})`)
    .join('\n');

  const peakLine = peaks.length > 0
    ? peaks.map(p => `${p.startMs}-${p.endMs}ms`).join(', ')
    : 'no sustained peaks';

  const dropLine = drops.length > 0
    ? drops.slice(0, 20).map(d => `${d.ms}ms(${d.from.toFixed(2)}→${d.to.toFixed(2)})`).join(', ')
    : 'no sharp drops';

  const riseLine = rises.length > 0
    ? rises.slice(0, 20).map(r => `${r.ms}ms(${r.from.toFixed(2)}→${r.to.toFixed(2)})`).join(', ')
    : 'no sharp rises';

  const prompt = `Create a light show for "${trackTitle}" (${durationSec}s, mood: ${mood || 'auto'}).
Generate approximately ${targetEvents} events (minimum ${Math.round(targetEvents * 0.8)}).
Estimated BPM: ${estimatedBPM} (beat every ${beatIntervalMs}ms).

# SONG STRUCTURE
${sectionLine}

# ENERGY PER SECOND (0.00=silence, 1.00=max)
${energyLine}

# FINE ENERGY GRID (200ms precision around key moments)
${fineGridLine}

# BEAT GRID
Strong beats: ${beatLine}

# PEAK SECTIONS (high energy — use strobes, all-on, blink speed 2)
${peakLine}

# DROPS (sudden energy decrease — dramatic pauses or full flash)
${dropLine}

# RISES (energy building — chase patterns, blink escalation)
${riseLine}

# INSTRUCTIONS
- CRITICAL: The car must NEVER be fully dark. At minimum, keep headlights breathing (solid, easeIn+easeOut).
- Each section (verse/chorus/bridge etc.) needs its OWN visual identity — don't repeat the same pattern everywhere.
- Place events ON the beat timestamps (${beatIntervalMs}ms apart at ${estimatedBPM} BPM).
- Use the FINE GRID for precise sub-beat placement around peaks and drops.
- CHORUS sections: maximum intensity, all 13 parts, blink speed 2, strobes, left-right ping-pong.
- VERSE sections: moderate — headlight pulse + blinker rhythm + occasional wave.
- BRIDGE sections: contrast — if rhythmic use building chase, if sustained use breathing + slow accents.
- Transitions between sections: use easeOut on ending events, easeIn on starting events.
- Events from 0ms to ${durationMs}ms — cover the FULL track with NO GAPS.
- Include closures at musically significant moments: windows at choruses, trunk at biggest buildup, flap at bridge/breakdown, retros at peaks.`;

  return {
    prompt,
    analysis: {
      beats: beatGrid.length,
      strongBeats: beatGrid.filter(b => b.strong).length,
      bpm: estimatedBPM,
      peaks: peaks.length,
      drops: drops.length,
      rises: rises.length,
      sections: sectionDetails.length,
      sectionTypes: sectionDetails.map(s => s.type).join(','),
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
    .slice(0, 600) // Hard limit
    .sort((a, b) => a.startMs - b.startMs);
}

module.exports = { generateLightShow };
