#!/usr/bin/env node
/**
 * Automated Light Show Generation Test Suite
 * 
 * Usage:
 *   node tests/test-generation.js                    # Run 3 tests with default prompt
 *   node tests/test-generation.js --runs 5           # Run 5 tests
 *   node tests/test-generation.js --prompt "chill"   # Custom user prompt
 *   node tests/test-generation.js --judge             # Enable LLM-as-judge (costs extra tokens)
 *   node tests/test-generation.js --judge --runs 3 --prompt "Strobes percutants"
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { generateLightShow } = require('../src/services/llmService');
const path = require('path');
const OpenAI = require('openai');

// ─── Config ───
const WAVEFORM_PATH = path.join(__dirname, '..', '..', 'assets', 'mp3', 'the_mountain-jingle-bells-449466.waveform.json');
const DEFAULT_PROMPT = 'Strobes percutants sur chaque beat, alternance gauche-droite rapide, intensité maximale.';
const TRACK_TITLE = 'Jingle Bells';

// ─── Parse CLI args ───
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}
const NUM_RUNS = parseInt(getArg('runs', '3'), 10);
const USER_PROMPT = getArg('prompt', DEFAULT_PROMPT);
const ENABLE_JUDGE = getArg('judge', false);

// ─── Part definitions for validation ───
const VALID_PARTS = [
  'left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light',
  'light_left_back', 'light_right_back',
  'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right',
  'side_repeater_left', 'side_repeater_right', 'license_plate', 'brake_lights', 'rear_fog',
  'window_left_front', 'window_right_front', 'window_left_back', 'window_right_back',
  'retro_left', 'retro_right', 'trunk', 'flap',
];

// ═══════════════════════════════════════════════════════════════
// DETERMINISTIC CHECKS
// ═══════════════════════════════════════════════════════════════

function runDeterministicChecks(events, durationMs, runIndex) {
  const checks = [];
  const warn = (name, msg) => checks.push({ name, status: 'WARN', msg });
  const pass = (name, msg) => checks.push({ name, status: 'PASS', msg });
  const fail = (name, msg) => checks.push({ name, status: 'FAIL', msg });

  // 1. Event count
  const count = events.length;
  if (count === 0) fail('event_count', `No events generated`);
  else if (count < 200) warn('event_count', `Only ${count} events (low, expected 400+)`);
  else if (count > 5000) warn('event_count', `${count} events (very high, may hit cap)`);
  else pass('event_count', `${count} events`);

  // 2. Full track coverage — events should span at least 90% of the track
  if (count > 0) {
    const maxEnd = Math.max(...events.map(e => e.endMs));
    const coveragePct = (maxEnd / durationMs) * 100;
    if (coveragePct < 80) fail('coverage', `Events only cover ${coveragePct.toFixed(1)}% of track`);
    else if (coveragePct < 90) warn('coverage', `Events cover ${coveragePct.toFixed(1)}% (should be >90%)`);
    else pass('coverage', `${coveragePct.toFixed(1)}% coverage`);
  }

  // 3. Even distribution — check per-quarter event counts
  if (count > 0) {
    const q = [0, 0, 0, 0];
    events.forEach(e => {
      const qi = Math.min(3, Math.floor(e.startMs / durationMs * 4));
      q[qi]++;
    });
    const avg = count / 4;
    const minQ = Math.min(...q);
    const maxQ = Math.max(...q);
    const ratio = minQ / maxQ;
    if (ratio < 0.15) fail('distribution', `Quarters: [${q.join(', ')}] — very uneven (ratio ${ratio.toFixed(2)})`);
    else if (ratio < 0.35) warn('distribution', `Quarters: [${q.join(', ')}] — uneven (ratio ${ratio.toFixed(2)})`);
    else pass('distribution', `Quarters: [${q.join(', ')}] (ratio ${ratio.toFixed(2)})`);
  }

  // 4. Variety — count unique patterns/effects used
  if (count > 0) {
    const effects = new Set(events.map(e => e.effect));
    const parts = new Set(events.map(e => e.part));
    const hasBlinkEvents = events.some(e => e.effect === 'blink');
    const hasSolidEvents = events.some(e => e.effect === 'solid');
    const hasEaseEvents = events.some(e => e.easeIn || e.easeOut);
    const varietyScore = effects.size + (hasEaseEvents ? 1 : 0);
    if (parts.size < 5) warn('variety_parts', `Only ${parts.size} unique parts used`);
    else pass('variety_parts', `${parts.size} unique parts used`);
    if (!hasBlinkEvents) warn('variety_effects', `No blink events — show may lack rhythm`);
    else if (!hasSolidEvents) warn('variety_effects', `No solid events — show may lack contrast`);
    else pass('variety_effects', `Mix of effects: ${[...effects].join(', ')}`);
  }

  // 5. Segment emptiness — check 10s segments for gaps
  if (count > 0) {
    const segSize = 10000;
    const numSegs = Math.ceil(durationMs / segSize);
    const segCounts = new Array(numSegs).fill(0);
    events.forEach(e => {
      const seg = Math.min(Math.floor(e.startMs / segSize), numSegs - 1);
      segCounts[seg]++;
    });
    const emptySegs = segCounts.filter(c => c === 0).length;
    const sparseSegs = segCounts.filter(c => c > 0 && c < 5).length;
    if (emptySegs > 0) fail('segment_gaps', `${emptySegs} empty 10s segments: ${segCounts.join(', ')}`);
    else if (sparseSegs > 2) warn('segment_gaps', `${sparseSegs} sparse segments (<5 events): ${segCounts.join(', ')}`);
    else pass('segment_gaps', `No empty segments: ${segCounts.join(', ')}`);
  }

  // 6. Valid parts — all events must use known parts
  if (count > 0) {
    const invalidParts = events.filter(e => !VALID_PARTS.includes(e.part));
    if (invalidParts.length > 0) {
      const badParts = [...new Set(invalidParts.map(e => e.part))];
      fail('valid_parts', `${invalidParts.length} events with invalid parts: ${badParts.join(', ')}`);
    } else {
      pass('valid_parts', `All parts valid`);
    }
  }

  // 7. Event integrity — startMs < endMs, no NaN
  if (count > 0) {
    const broken = events.filter(e =>
      typeof e.startMs !== 'number' || typeof e.endMs !== 'number' ||
      isNaN(e.startMs) || isNaN(e.endMs) || e.startMs >= e.endMs
    );
    if (broken.length > 0) fail('event_integrity', `${broken.length} broken events (NaN or startMs >= endMs)`);
    else pass('event_integrity', `All events have valid timestamps`);
  }

  // 8. Closure limits
  if (count > 0) {
    const retroCount = events.filter(e => e.part === 'retro_left' || e.part === 'retro_right').length;
    const windowCount = events.filter(e => e.part?.startsWith('window_')).length;
    const trunkCount = events.filter(e => e.part === 'trunk').length;
    const flapCount = events.filter(e => e.part === 'flap').length;
    if (retroCount > 12) warn('closure_retro', `${retroCount} retro events (max 12 = 6 roundtrips)`);
    else pass('closure_retro', `${retroCount} retro events`);
    if (trunkCount > 3) warn('closure_trunk', `${trunkCount} trunk events (max 3 = 1 sequence)`);
    else pass('closure_trunk', `${trunkCount} trunk events`);
    if (flapCount > 3) warn('closure_flap', `${flapCount} flap events (max 3 = 1 sequence)`);
    else pass('closure_flap', `${flapCount} flap events`);
  }

  // 9. Monotony check — look for consecutive same-duration events on same parts
  if (count > 0) {
    // Group by part, sort by startMs, look for runs of identical durations
    const byPart = {};
    events.forEach(e => {
      if (!byPart[e.part]) byPart[e.part] = [];
      byPart[e.part].push(e);
    });
    let worstRun = 0;
    let worstPart = '';
    for (const [part, partEvents] of Object.entries(byPart)) {
      const sorted = partEvents.sort((a, b) => a.startMs - b.startMs);
      let run = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prevDur = sorted[i - 1].endMs - sorted[i - 1].startMs;
        const currDur = sorted[i].endMs - sorted[i].startMs;
        if (Math.abs(prevDur - currDur) < 50 && sorted[i].effect === sorted[i - 1].effect) {
          run++;
        } else {
          run = 1;
        }
        if (run > worstRun) { worstRun = run; worstPart = part; }
      }
    }
    if (worstRun > 15) fail('monotony', `${worstRun} identical consecutive events on "${worstPart}" — very repetitive`);
    else if (worstRun > 8) warn('monotony', `${worstRun} identical consecutive events on "${worstPart}"`);
    else pass('monotony', `Max consecutive identical: ${worstRun} on "${worstPart}"`);
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════
// LLM-AS-JUDGE
// ═══════════════════════════════════════════════════════════════

async function llmJudge(events, durationMs, meta, userPrompt) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Build a summary of the show for the judge
  const partCounts = {};
  events.forEach(e => { partCounts[e.part] = (partCounts[e.part] || 0) + 1; });

  const segSize = 10000;
  const numSegs = Math.ceil(durationMs / segSize);
  const segCounts = new Array(numSegs).fill(0);
  events.forEach(e => { segCounts[Math.min(Math.floor(e.startMs / segSize), numSegs - 1)]++; });

  // Sample events at different time points
  const sampleTimes = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.95].map(r => Math.round(r * durationMs));
  const samples = sampleTimes.map(t => {
    const nearby = events.filter(e => e.startMs >= t - 2000 && e.startMs <= t + 2000);
    return {
      timeMs: t,
      eventsInWindow: nearby.length,
      patterns: [...new Set(nearby.map(e => `${e.part}:${e.effect}:${e.endMs - e.startMs}ms`))].slice(0, 8),
    };
  });

  const judgingPrompt = `You are a Tesla Light Show quality judge. Rate this AI-generated light show.

CONTEXT:
- Track: "${TRACK_TITLE}" (${(durationMs / 1000).toFixed(0)}s)
- User requested: "${userPrompt}"
- Total events: ${events.length}
- Choreography placements: ${meta.choreographyPlacements}
- Events per 10s segment: [${segCounts.join(', ')}]
- Parts used: ${JSON.stringify(partCounts)}
- Model: ${meta.model}, tokens: ${meta.totalTokens}

EVENT SAMPLES (at different time points):
${samples.map(s => `  ${(s.timeMs / 1000).toFixed(0)}s: ${s.eventsInWindow} events — ${s.patterns.join(', ')}`).join('\n')}

RATE on these criteria (1-10 each):
1. **variety**: Does the show use diverse patterns? Or is it repetitive?
2. **coverage**: Does the show cover the full track evenly? Or are there gaps/front-loading?
3. **musicality**: Based on the user prompt and segment distribution, does it seem to match the music?
4. **creativity**: Is the show interesting? Good use of layering, transitions, climax?
5. **prompt_adherence**: Does it match what the user asked for?

Return JSON only:
{"variety":N,"coverage":N,"musicality":N,"creativity":N,"prompt_adherence":N,"overall":N,"issues":["..."],"strengths":["..."]}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500,
      messages: [{ role: 'user', content: judgingPrompt }],
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TESLA LIGHT SHOW — AUTOMATED GENERATION TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Runs: ${NUM_RUNS}`);
  console.log(`  Prompt: "${USER_PROMPT}"`);
  console.log(`  LLM Judge: ${ENABLE_JUDGE ? 'ON' : 'OFF (use --judge to enable)'}`);
  console.log(`  Track: ${TRACK_TITLE}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Load waveform
  let waveformData;
  try {
    waveformData = require(WAVEFORM_PATH);
  } catch (e) {
    console.error(`❌ Could not load waveform: ${WAVEFORM_PATH}`);
    console.error(e.message);
    process.exit(1);
  }
  const waveform = waveformData.bars || waveformData;
  const durationMs = Math.round((waveformData.duration || 104) * 1000);
  console.log(`📊 Waveform loaded: ${waveform.length} samples, ${(durationMs / 1000).toFixed(1)}s\n`);

  // Downsample like the route does
  function downsample(arr, target) {
    if (arr.length <= target) return arr;
    const bucketSize = arr.length / target;
    const result = [];
    for (let i = 0; i < target; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.floor((i + 1) * bucketSize);
      let max = 0;
      for (let j = start; j < end && j < arr.length; j++) {
        if (arr[j] > max) max = arr[j];
      }
      result.push(Math.round(max * 1000) / 1000);
    }
    return result;
  }
  const downsampled = downsample(waveform, 1000);

  const allResults = [];

  for (let run = 0; run < NUM_RUNS; run++) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  RUN ${run + 1}/${NUM_RUNS}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const startTime = Date.now();
    let result;
    try {
      result = await generateLightShow({
        waveform: downsampled,
        durationMs,
        mood: 'auto',
        trackTitle: TRACK_TITLE,
        userPrompt: USER_PROMPT,
      });
    } catch (err) {
      console.error(`  ❌ Generation failed: ${err.message}`);
      allResults.push({ run: run + 1, error: err.message });
      continue;
    }
    const elapsed = Date.now() - startTime;

    console.log(`\n  ⏱  Generated in ${elapsed}ms`);
    console.log(`  📊 ${result.events.length} events, ${result.meta.choreographyPlacements} placements`);
    console.log(`  💰 ~$${result.meta.estimatedCost.toFixed(4)} (${result.meta.totalTokens} tokens)`);
    console.log(`  🏁 Finish: ${result.meta.finishReason}`);

    // Deterministic checks
    console.log(`\n  📋 DETERMINISTIC CHECKS:`);
    const checks = runDeterministicChecks(result.events, durationMs, run);
    let passCount = 0, warnCount = 0, failCount = 0;
    for (const check of checks) {
      const icon = check.status === 'PASS' ? '✅' : check.status === 'WARN' ? '⚠️ ' : '❌';
      console.log(`    ${icon} ${check.name}: ${check.msg}`);
      if (check.status === 'PASS') passCount++;
      else if (check.status === 'WARN') warnCount++;
      else failCount++;
    }
    console.log(`\n    Score: ${passCount}/${checks.length} pass, ${warnCount} warn, ${failCount} fail`);

    // LLM-as-judge
    let judgeResult = null;
    if (ENABLE_JUDGE) {
      console.log(`\n  🤖 LLM JUDGE:`);
      judgeResult = await llmJudge(result.events, durationMs, result.meta, USER_PROMPT);
      if (judgeResult.error) {
        console.log(`    ❌ Judge error: ${judgeResult.error}`);
      } else {
        console.log(`    Variety:          ${judgeResult.variety}/10`);
        console.log(`    Coverage:         ${judgeResult.coverage}/10`);
        console.log(`    Musicality:       ${judgeResult.musicality}/10`);
        console.log(`    Creativity:       ${judgeResult.creativity}/10`);
        console.log(`    Prompt adherence: ${judgeResult.prompt_adherence}/10`);
        console.log(`    ─────────────────────────`);
        console.log(`    OVERALL:          ${judgeResult.overall}/10`);
        if (judgeResult.strengths?.length) console.log(`    ✅ Strengths: ${judgeResult.strengths.join('; ')}`);
        if (judgeResult.issues?.length) console.log(`    ⚠️  Issues: ${judgeResult.issues.join('; ')}`);
      }
    }

    allResults.push({
      run: run + 1,
      events: result.events.length,
      placements: result.meta.choreographyPlacements,
      tokens: result.meta.totalTokens,
      cost: result.meta.estimatedCost,
      elapsed,
      finishReason: result.meta.finishReason,
      checksPass: passCount,
      checksWarn: warnCount,
      checksFail: failCount,
      checksTotal: checks.length,
      judge: judgeResult,
    });
  }

  // ─── Summary ───
  console.log(`\n\n═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY (${NUM_RUNS} runs)`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  const successful = allResults.filter(r => !r.error);
  if (successful.length === 0) {
    console.log('  ❌ All runs failed!');
    process.exit(1);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(`  Events:     min=${Math.min(...successful.map(r => r.events))} avg=${Math.round(avg(successful.map(r => r.events)))} max=${Math.max(...successful.map(r => r.events))}`);
  console.log(`  Placements: min=${Math.min(...successful.map(r => r.placements))} avg=${Math.round(avg(successful.map(r => r.placements)))} max=${Math.max(...successful.map(r => r.placements))}`);
  console.log(`  Tokens:     min=${Math.min(...successful.map(r => r.tokens))} avg=${Math.round(avg(successful.map(r => r.tokens)))} max=${Math.max(...successful.map(r => r.tokens))}`);
  console.log(`  Cost:       total=$${successful.reduce((s, r) => s + r.cost, 0).toFixed(4)}`);
  console.log(`  Time:       min=${Math.min(...successful.map(r => r.elapsed))}ms avg=${Math.round(avg(successful.map(r => r.elapsed)))}ms max=${Math.max(...successful.map(r => r.elapsed))}ms`);

  const totalFails = successful.reduce((s, r) => s + r.checksFail, 0);
  const totalWarns = successful.reduce((s, r) => s + r.checksWarn, 0);
  const totalChecks = successful.reduce((s, r) => s + r.checksTotal, 0);
  const totalPass = successful.reduce((s, r) => s + r.checksPass, 0);
  console.log(`  Checks:     ${totalPass}/${totalChecks} pass, ${totalWarns} warn, ${totalFails} fail`);

  if (ENABLE_JUDGE) {
    const judged = successful.filter(r => r.judge && !r.judge.error);
    if (judged.length > 0) {
      const fields = ['variety', 'coverage', 'musicality', 'creativity', 'prompt_adherence', 'overall'];
      console.log(`\n  LLM Judge averages (${judged.length} runs):`);
      for (const field of fields) {
        const vals = judged.map(r => r.judge[field]).filter(v => typeof v === 'number');
        if (vals.length > 0) {
          const avgVal = avg(vals);
          const bar = '█'.repeat(Math.round(avgVal)) + '░'.repeat(10 - Math.round(avgVal));
          console.log(`    ${field.padEnd(18)} ${bar} ${avgVal.toFixed(1)}/10`);
        }
      }
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════\n`);

  // Exit with error code if any checks failed
  if (totalFails > 0) {
    console.log(`⚠️  ${totalFails} check(s) FAILED across ${NUM_RUNS} runs.`);
    process.exit(1);
  } else {
    console.log(`✅ All checks passed across ${NUM_RUNS} runs.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
