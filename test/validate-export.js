// Validate FSEQ export logic by simulating the 3 test shows
// This runs the same logic as fseqExport.js but in Node.js
// Run: node test/validate-export.js

const STEP_TIME_MS = 20;
const CHANNEL_COUNT = 48;

const CLOSURE_MAP = {
  retro_left: 34, retro_right: 35,
  window_left_front: 36, window_left_back: 37,
  window_right_front: 38, window_right_back: 39,
  trunk: 40, flap: 45,
};

const CLOSURE_CMD = { IDLE: 0, OPEN: 64, DANCE: 128, CLOSE: 192, STOP: 255 };
const CMD_NAMES = { 0: 'IDLE', 64: 'OPEN', 128: 'DANCE', 192: 'CLOSE', 255: 'STOP' };

const CHANNEL_MAP = {
  light_left_front: [0, 2, 4, 6, 8, 10],
  light_right_front: [1, 3, 5, 7, 9, 11],
  light_left_back: [25],
  light_right_back: [26],
  blink_front_left: [12],
  blink_front_right: [13],
  blink_back_left: [22],
  blink_back_right: [23],
};

const BLINK_SPEEDS = [
  { label: '1x', periodMs: 80 },
  { label: '2x', periodMs: 50 },
  { label: '3x', periodMs: 30 },
];

const isRetro = (p) => p && p.includes('retro');
const isWindow = (p) => p && p.includes('window');
const isTrunk = (p) => p === 'trunk';
const isFlap = (p) => p === 'flap';

function getClosureCommand(evt) {
  const part = evt.part;
  if (isRetro(part)) {
    const mode = evt.retroMode ?? 'roundtrip';
    if (mode === 'open') return { type: 'single', value: CLOSURE_CMD.OPEN };
    if (mode === 'close') return { type: 'single', value: CLOSURE_CMD.CLOSE };
    if (mode === 'roundtrip') return { type: 'roundtrip' };
  }
  if (isWindow(part)) return { type: 'single', value: CLOSURE_CMD.DANCE };
  if (isTrunk(part)) {
    const mode = evt.trunkMode ?? 'trunk_open';
    if (mode === 'trunk_open') return { type: 'single', value: CLOSURE_CMD.OPEN };
    if (mode === 'trunk_close') return { type: 'single', value: CLOSURE_CMD.CLOSE };
    if (mode === 'trunk_dance') return { type: 'single', value: CLOSURE_CMD.DANCE };
  }
  if (isFlap(part)) {
    const mode = evt.flapMode ?? 'flap_open';
    if (mode === 'flap_open') return { type: 'single', value: CLOSURE_CMD.OPEN };
    if (mode === 'flap_close') return { type: 'single', value: CLOSURE_CMD.CLOSE };
    if (mode === 'flap_rainbow') return { type: 'single', value: CLOSURE_CMD.DANCE };
  }
  return null;
}

function computeIntensity(evt, posMs) {
  if (posMs < evt.startMs || posMs >= evt.endMs) return 0;
  let intensity = (evt.power ?? 100) / 100;
  const evtDuration = evt.endMs - evt.startMs;
  const elapsed = posMs - evt.startMs;
  const remaining = evt.endMs - posMs;
  const easeDuration = Math.min(evtDuration * 0.3, 1500);
  if (evt.easeIn && elapsed < easeDuration && easeDuration > 0) {
    intensity *= elapsed / easeDuration;
  }
  if (evt.easeOut && remaining < easeDuration && easeDuration > 0) {
    intensity *= remaining / easeDuration;
  }
  if (evt.effect === 'blink') {
    const speedIdx = evt.blinkSpeed ?? 0;
    const periodMs = BLINK_SPEEDS[speedIdx]?.periodMs ?? 80;
    const blinkOff = (Math.floor(elapsed / (periodMs / 2)) % 2) !== 0;
    if (blinkOff) return 0;
  }
  return intensity;
}

function writeClosure(data, ch, startMs, endMs, cmdValue, frameCount) {
  const sf = Math.floor(startMs / STEP_TIME_MS);
  const ef = Math.min(Math.floor(endMs / STEP_TIME_MS), frameCount);
  for (let f = sf; f < ef; f++) {
    data[f * CHANNEL_COUNT + ch] = cmdValue;
  }
}

function compileAndValidate(showName, events, durationMs) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SHOW: ${showName} (${(durationMs/1000).toFixed(0)}s)`);
  console.log('='.repeat(60));

  const frameCount = Math.ceil(durationMs / STEP_TIME_MS);
  const data = new Uint8Array(frameCount * CHANNEL_COUNT);

  // Light events
  const lightEvents = events.filter((evt) => CHANNEL_MAP[evt.part] !== undefined);
  for (let frame = 0; frame < frameCount; frame++) {
    const posMs = frame * STEP_TIME_MS;
    for (const evt of lightEvents) {
      const intensity = computeIntensity(evt, posMs);
      if (intensity > 0) {
        const channels = CHANNEL_MAP[evt.part];
        const value = Math.round(intensity * 255);
        for (const ch of channels) {
          const offset = frame * CHANNEL_COUNT + ch;
          data[offset] = Math.max(data[offset], value);
        }
      }
    }
  }

  // Closure events
  const closureEvents = events.filter((evt) => CLOSURE_MAP[evt.part] !== undefined);
  for (const evt of closureEvents) {
    const ch = CLOSURE_MAP[evt.part];
    const cmd = getClosureCommand(evt);
    if (!cmd) { console.log(`  ⚠️  No command for ${evt.part} mode=${evt.retroMode || evt.trunkMode || evt.flapMode}`); continue; }
    if (cmd.type === 'single') {
      writeClosure(data, ch, evt.startMs, evt.endMs, cmd.value, frameCount);
    } else if (cmd.type === 'roundtrip') {
      const midMs = evt.startMs + Math.floor((evt.endMs - evt.startMs) / 2);
      writeClosure(data, ch, evt.startMs, midMs, CLOSURE_CMD.CLOSE, frameCount);
      writeClosure(data, ch, midMs, evt.endMs, CLOSURE_CMD.OPEN, frameCount);
    }
  }

  // Validate closure channels
  console.log('\n📡 Closure channels:');
  for (const [chStr, name] of Object.entries({
    34: 'retro_left', 35: 'retro_right', 36: 'win_L_front', 37: 'win_L_back',
    38: 'win_R_front', 39: 'win_R_back', 40: 'trunk', 45: 'flap'
  })) {
    const ch = parseInt(chStr);
    let prevVal = 0;
    const transitions = [];
    for (let f = 0; f < frameCount; f++) {
      const val = data[f * CHANNEL_COUNT + ch];
      if (val !== prevVal) {
        transitions.push({ timeS: (f * STEP_TIME_MS / 1000).toFixed(2), cmd: CMD_NAMES[val] || val });
        prevVal = val;
      }
    }
    if (transitions.length > 0) {
      const desc = transitions.map(t => `${t.timeS}s→${t.cmd}`).join(', ');
      console.log(`  Ch ${ch} (${name}): ${desc}`);
    }
  }

  // Validate light channels with ease
  const easeEvents = lightEvents.filter(e => e.easeIn || e.easeOut);
  if (easeEvents.length > 0) {
    console.log('\n💡 Ease in/out verification:');
    for (const evt of easeEvents) {
      const channels = CHANNEL_MAP[evt.part];
      const ch = channels[0];
      const startFrame = Math.floor(evt.startMs / STEP_TIME_MS);
      const endFrame = Math.min(Math.floor(evt.endMs / STEP_TIME_MS), frameCount);
      const easeDur = Math.min((evt.endMs - evt.startMs) * 0.3, 1500);

      if (evt.easeIn) {
        const rampEnd = Math.min(startFrame + Math.ceil(easeDur / STEP_TIME_MS), endFrame);
        const startVal = data[startFrame * CHANNEL_COUNT + ch];
        const midVal = data[Math.floor((startFrame + rampEnd) / 2) * CHANNEL_COUNT + ch];
        const fullVal = data[rampEnd * CHANNEL_COUNT + ch];
        console.log(`  ${evt.part} easeIn: ramp ${(easeDur/1000).toFixed(2)}s | start=${startVal} mid=${midVal} full=${fullVal} ${startVal < midVal && midVal < fullVal ? '✅' : '⚠️'}`);
      }
      if (evt.easeOut) {
        const rampStart = Math.max(endFrame - Math.ceil(easeDur / STEP_TIME_MS), startFrame);
        const fullVal = data[(rampStart - 1) * CHANNEL_COUNT + ch];
        const midVal = data[Math.floor((rampStart + endFrame) / 2) * CHANNEL_COUNT + ch];
        const endVal = data[(endFrame - 1) * CHANNEL_COUNT + ch];
        console.log(`  ${evt.part} easeOut: ramp ${(easeDur/1000).toFixed(2)}s | full=${fullVal} mid=${midVal} end=${endVal} ${fullVal > midVal && midVal > endVal ? '✅' : '⚠️'}`);
      }
    }
  }

  // Check for cross-contamination: any unexpected channel activity
  console.log('\n🔍 Cross-check: unexpected channel activity:');
  let clean = true;
  for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
    let hasData = false;
    for (let f = 0; f < frameCount && !hasData; f++) {
      if (data[f * CHANNEL_COUNT + ch] > 0) hasData = true;
    }
    if (!hasData) continue;
    // Check if this channel is expected
    const isExpectedLight = lightEvents.some(e => (CHANNEL_MAP[e.part] || []).includes(ch));
    const isExpectedClosure = closureEvents.some(e => CLOSURE_MAP[e.part] === ch);
    if (!isExpectedLight && !isExpectedClosure) {
      console.log(`  ⚠️  Ch ${ch}: has data but NO event targets it!`);
      clean = false;
    }
  }
  if (clean) console.log('  ✅ All active channels match expected events');

  return data;
}

// ===== TEST SHOW 1: Closures isolées =====
compileAndValidate('Clé 1 — Closures isolées', [
  { part: 'flap', startMs: 5000, endMs: 8000, flapMode: 'flap_open' },
  { part: 'flap', startMs: 12000, endMs: 15000, flapMode: 'flap_close' },
  { part: 'flap', startMs: 20000, endMs: 25000, flapMode: 'flap_rainbow' },
  { part: 'retro_left', startMs: 30000, endMs: 32000, retroMode: 'close' },
  { part: 'retro_left', startMs: 36000, endMs: 38000, retroMode: 'open' },
  { part: 'retro_right', startMs: 42000, endMs: 44000, retroMode: 'close' },
  { part: 'retro_right', startMs: 48000, endMs: 50000, retroMode: 'open' },
], 55000);

// ===== TEST SHOW 2: Fenêtres décalées =====
compileAndValidate('Clé 2 — Fenêtres décalées', [
  { part: 'window_left_front', startMs: 5000, endMs: 10000, windowMode: 'window_dance' },
  { part: 'window_left_back', startMs: 5000, endMs: 10000, windowMode: 'window_dance' },
  { part: 'window_right_front', startMs: 15000, endMs: 20000, windowMode: 'window_dance' },
  { part: 'window_right_back', startMs: 15000, endMs: 20000, windowMode: 'window_dance' },
  { part: 'window_left_front', startMs: 25000, endMs: 30000, windowMode: 'window_dance' },
  { part: 'window_left_back', startMs: 25000, endMs: 30000, windowMode: 'window_dance' },
  { part: 'window_right_front', startMs: 25000, endMs: 30000, windowMode: 'window_dance' },
  { part: 'window_right_back', startMs: 25000, endMs: 30000, windowMode: 'window_dance' },
], 35000);

// ===== TEST SHOW 3: Coffre + Ease =====
compileAndValidate('Clé 3 — Coffre + Ease', [
  { part: 'trunk', startMs: 5000, endMs: 13000, trunkMode: 'trunk_open' },
  { part: 'trunk', startMs: 13000, endMs: 23000, trunkMode: 'trunk_dance' },
  { part: 'light_left_back', startMs: 30000, endMs: 35000, effect: 'solid', power: 100, easeIn: true, easeOut: false },
  { part: 'light_right_back', startMs: 40000, endMs: 45000, effect: 'solid', power: 100, easeIn: false, easeOut: true },
  { part: 'light_left_back', startMs: 50000, endMs: 55000, effect: 'solid', power: 100, easeIn: true, easeOut: true },
], 60000);

console.log('\n✅ Validation complete');
