/**
 * Coded light show patterns.
 * Each pattern is a function that takes (startMs, params) and returns an array of events.
 * The LLM just picks which patterns to place at which timestamps.
 */

// ─── Part groups ───
const LEFT_LIGHTS = ['left_high_light', 'left_signature_light', 'light_left_back', 'blink_front_left', 'blink_back_left', 'side_repeater_left'];
const RIGHT_LIGHTS = ['right_high_light', 'right_signature_light', 'light_right_back', 'blink_front_right', 'blink_back_right', 'side_repeater_right'];
const ALL_LIGHTS = [
  'left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light',
  'light_left_back', 'light_right_back',
  'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right',
  'side_repeater_left', 'side_repeater_right', 'license_plate', 'brake_lights', 'rear_fog',
];
const FRONT_LIGHTS = ['left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light', 'blink_front_left', 'blink_front_right'];
const BACK_LIGHTS = ['light_left_back', 'light_right_back', 'blink_back_left', 'blink_back_right', 'brake_lights', 'rear_fog', 'license_plate'];
const HEADLIGHTS = ['left_high_light', 'right_high_light'];
const SIGNATURES = ['left_signature_light', 'right_signature_light'];
const ALL_HEADLIGHTS = [...HEADLIGHTS, ...SIGNATURES];
const TAILLIGHTS = ['light_left_back', 'light_right_back'];
const BLINKERS = ['blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right'];
const SIDES = ['side_repeater_left', 'side_repeater_right'];
const ALL_WINDOWS = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];

// Juniper-only groups (Model Y 2024+)
const JUNIPER_CENTER_BARS = ['light_center_front', 'light_center_back'];
const JUNIPER_INTERIOR_LEDS = [
  'interior_front_door_left',
  'interior_front_door_right',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
];

// Wave sweep sequence front → back
const WAVE_SEQUENCE = [
  ALL_HEADLIGHTS,                                      // front headlights + signatures
  ['blink_front_left', 'blink_front_right'],          // front blinkers
  SIDES,                                              // side repeaters
  TAILLIGHTS,                                         // tail lights
  ['brake_lights', 'rear_fog', 'license_plate'],      // rear accents
];

// Chase sequence around the car
const CHASE_SEQUENCE = [
  'left_high_light', 'left_signature_light', 'blink_front_left', 'side_repeater_left',
  'light_left_back', 'blink_back_left', 'license_plate',
  'blink_back_right', 'light_right_back', 'side_repeater_right',
  'blink_front_right', 'right_high_light', 'right_signature_light',
];

// ─── Helper ───
function evt(part, startMs, endMs, opts = {}) {
  return {
    part,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    effect: opts.effect || 'solid',
    blinkSpeed: opts.blinkSpeed ?? 0,
    pulseSpeed: opts.pulseSpeed ?? 0,
    easeIn: opts.easeIn || false,
    easeOut: opts.easeOut || false,
    // Closure-specific
    ...(opts.retroMode ? { retroMode: opts.retroMode } : {}),
    ...(opts.windowMode ? { windowMode: opts.windowMode, windowDurationMs: opts.windowDurationMs || 15000 } : {}),
    ...(opts.trunkMode ? { trunkMode: opts.trunkMode } : {}),
    ...(opts.flapMode ? { flapMode: opts.flapMode } : {}),
    // RGB-specific (Juniper interior LEDs)
    ...(opts.rgbColor !== undefined ? { rgbColor: opts.rgbColor } : {}),
    ...(opts.rgbRainbow !== undefined ? { rgbRainbow: opts.rgbRainbow } : {}),
    ...(opts.rgbSync !== undefined ? { rgbSync: opts.rgbSync } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// PATTERN LIBRARY
// ═══════════════════════════════════════════════════════════════

/**
 * "breathing" — Gentle headlight + taillight pulse with easeIn/easeOut.
 * Params: { durationMs=3000 }
 * Great for: intros, outros, quiet passages
 */
function breathing(startMs, params = {}) {
  const dur = params.durationMs || 3000;
  const events = [];
  for (const part of [...ALL_HEADLIGHTS, ...TAILLIGHTS]) {
    events.push(evt(part, startMs, startMs + dur, { easeIn: true, easeOut: true }));
  }
  return events;
}

/**
 * "pulse" — All headlights + taillights short burst on beat.
 * Params: { durationMs=300 }
 * Great for: marking every beat in verses
 */
function pulse(startMs, params = {}) {
  const dur = params.durationMs || 300;
  const events = [];
  for (const part of [...ALL_HEADLIGHTS, ...TAILLIGHTS]) {
    events.push(evt(part, startMs, startMs + dur));
  }
  return events;
}

/**
 * "fullPulse" — ALL 13 light parts short burst.
 * Params: { durationMs=300 }
 * Great for: strong beats, accents
 */
function fullPulse(startMs, params = {}) {
  const dur = params.durationMs || 300;
  return ALL_LIGHTS.map(part => evt(part, startMs, startMs + dur));
}

/**
 * "strobe" — All lights blink fast.
 * Params: { durationMs=1000, blinkSpeed=2 }
 * Great for: peaks, drops, climax
 */
function strobe(startMs, params = {}) {
  const dur = params.durationMs || 1000;
  const speed = params.blinkSpeed ?? 2;
  return ALL_LIGHTS.map(part => evt(part, startMs, startMs + dur, { effect: 'blink', blinkSpeed: speed }));
}

/**
 * "wave" — Sequential front→back sweep.
 * Params: { stagger=200, holdMs=600, reverse=false }
 * Great for: strong beats, accents, transitions
 */
function wave(startMs, params = {}) {
  const stagger = params.stagger || 200;
  const holdMs = params.holdMs || 600;
  const reverse = params.reverse || false;
  const seq = reverse ? [...WAVE_SEQUENCE].reverse() : WAVE_SEQUENCE;
  const events = [];
  seq.forEach((group, i) => {
    const t = startMs + i * stagger;
    for (const part of group) {
      events.push(evt(part, t, t + holdMs));
    }
  });
  return events;
}

/**
 * "pingPong" — Left/right sides alternate blinking back and forth.
 * Params: { durationMs=4000, blinkSpeed=1, cycles=4 }
 * Great for: rhythmic verses and choruses. Looks like lights bouncing L↔R.
 */
function pingPong(startMs, params = {}) {
  const dur = params.durationMs || 4000;
  const speed = params.blinkSpeed ?? 1;
  const cycles = params.cycles || Math.max(2, Math.round(dur / 800));
  const cycleMs = dur / cycles;
  const events = [];
  for (let i = 0; i < cycles; i++) {
    const t = startMs + i * cycleMs;
    const side = i % 2 === 0 ? LEFT_LIGHTS : RIGHT_LIGHTS;
    for (const part of side) {
      events.push(evt(part, t, t + cycleMs, { effect: 'blink', blinkSpeed: speed }));
    }
  }
  return events;
}

/**
 * "chase" — Single light runs around the car.
 * Params: { stepMs=150, holdMs=300, loops=1 }
 * Great for: buildups, bridges, energy rises
 */
function chase(startMs, params = {}) {
  const stepMs = params.stepMs || 150;
  const holdMs = params.holdMs || 300;
  const loops = params.loops || 1;
  const events = [];
  for (let loop = 0; loop < loops; loop++) {
    const loopOffset = loop * CHASE_SEQUENCE.length * stepMs;
    CHASE_SEQUENCE.forEach((part, i) => {
      const t = startMs + loopOffset + i * stepMs;
      events.push(evt(part, t, t + holdMs));
    });
  }
  return events;
}

/**
 * "escalation" — Blink speed increases in 3 phases (slow → medium → fast).
 * Params: { phaseDurationMs=1000 }
 * Great for: buildups before drops
 */
function escalation(startMs, params = {}) {
  const phaseMs = params.phaseDurationMs || 1000;
  const events = [];
  const parts = [...ALL_HEADLIGHTS, ...BLINKERS];
  [0, 1, 2].forEach((speed, phase) => {
    const t = startMs + phase * phaseMs;
    for (const part of parts) {
      events.push(evt(part, t, t + phaseMs, { effect: 'blink', blinkSpeed: speed }));
    }
  });
  return events;
}

/**
 * "cascade" — Ultra-fast wave sweep, all 13 parts with tiny stagger.
 * Params: { stagger=80 }
 * Great for: climax moments
 */
function cascade(startMs, params = {}) {
  const stagger = params.stagger || 80;
  const events = [];
  ALL_LIGHTS.forEach((part, i) => {
    const t = startMs + i * stagger;
    events.push(evt(part, t, t + 400));
  });
  return events;
}

/**
 * "flashHold" — All lights ON solid for a sustained moment.
 * Params: { durationMs=500 }
 * Great for: after drops, impact moments
 */
function flashHold(startMs, params = {}) {
  const dur = params.durationMs || 500;
  return ALL_LIGHTS.map(part => evt(part, startMs, startMs + dur));
}

/**
 * "blinkerRhythm" — 4 blinkers blinking for a sustained duration.
 * Params: { durationMs=3000, blinkSpeed=1 }
 * Great for: subtle rhythm layer in verses. 4 events.
 */
function blinkerRhythm(startMs, params = {}) {
  const dur = params.durationMs || 3000;
  const speed = params.blinkSpeed ?? 1;
  return BLINKERS.map(part => evt(part, startMs, startMs + dur, { effect: 'blink', blinkSpeed: speed }));
}

/**
 * "frontBack" — Front lights blink first half, back lights blink second half.
 * Params: { durationMs=3000, blinkSpeed=1 }
 * Great for: verse variation, moderate energy. ~11 events.
 */
function frontBack(startMs, params = {}) {
  const dur = params.durationMs || 3000;
  const speed = params.blinkSpeed ?? 1;
  const half = dur / 2;
  const events = [];
  for (const part of FRONT_LIGHTS) {
    events.push(evt(part, startMs, startMs + half, { effect: 'blink', blinkSpeed: speed }));
  }
  for (const part of BACK_LIGHTS) {
    events.push(evt(part, startMs + half, startMs + dur, { effect: 'blink', blinkSpeed: speed }));
  }
  return events;
}

/**
 * "symmetricPulse" — Headlights+taillights blink at one speed, blinkers+sides at another.
 * Params: { durationMs=3000, blinkSpeed=1 }
 * Great for: choruses, medium-high energy. 8 events.
 */
function symmetricPulse(startMs, params = {}) {
  const dur = params.durationMs || 3000;
  const speed = params.blinkSpeed ?? 1;
  const events = [];
  // Main lights blink at requested speed
  for (const part of [...ALL_HEADLIGHTS, ...TAILLIGHTS]) {
    events.push(evt(part, startMs, startMs + dur, { effect: 'blink', blinkSpeed: speed }));
  }
  // Sides + blinkers blink at faster speed for contrast
  const accentSpeed = Math.min(2, speed + 1);
  for (const part of [...SIDES, ...BLINKERS]) {
    events.push(evt(part, startMs, startMs + dur, { effect: 'blink', blinkSpeed: accentSpeed }));
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
// CLOSURE PATTERNS
// ═══════════════════════════════════════════════════════════════

/**
 * "windowsDance" — All 4 windows dance together.
 * Params: { durationMs=15000 }
 */
function windowsDance(startMs, params = {}) {
  const dur = params.durationMs || 15000;
  return ALL_WINDOWS.map(part => evt(part, startMs, startMs + dur, {
    windowMode: 'window_dance',
    windowDurationMs: dur,
  }));
}

/**
 * "trunkSequence" — Open → pause → dance → close (full trunk choreography).
 * Params: { openDurationMs=4000, pauseMs=2000, danceDurationMs=12000 }
 */
function trunkSequence(startMs, params = {}) {
  const openDur = params.openDurationMs || 4000;
  const pauseMs = params.pauseMs || 2000;
  const danceDur = params.danceDurationMs || 12000;
  const closeDur = 3000;

  const openEnd = startMs + openDur;
  const danceStart = openEnd + pauseMs;
  const danceEnd = danceStart + danceDur;
  const closeEnd = danceEnd + closeDur;

  return [
    evt('trunk', startMs, openEnd, { trunkMode: 'trunk_open' }),
    evt('trunk', danceStart, danceEnd, { trunkMode: 'trunk_dance' }),
    evt('trunk', danceEnd, closeEnd, { trunkMode: 'trunk_close' }),
  ];
}

/**
 * "retroRoundtrip" — Both retros roundtrip simultaneously.
 * Params: { durationMs=2000 }
 */
function retroRoundtrip(startMs, params = {}) {
  const dur = params.durationMs || 2000;
  return [
    evt('retro_left', startMs, startMs + dur, { retroMode: 'roundtrip' }),
    evt('retro_right', startMs, startMs + dur, { retroMode: 'roundtrip' }),
  ];
}

/**
 * "flapSequence" — Open → rainbow → close.
 * Params: { openMs=3000, rainbowMs=8000 }
 */
function flapSequence(startMs, params = {}) {
  const openMs = params.openMs || 3000;
  const rainbowMs = params.rainbowMs || 8000;
  const closeMs = 3000;
  return [
    evt('flap', startMs, startMs + openMs, { flapMode: 'flap_open' }),
    evt('flap', startMs + openMs, startMs + openMs + rainbowMs, { flapMode: 'flap_rainbow' }),
    evt('flap', startMs + openMs + rainbowMs, startMs + openMs + rainbowMs + closeMs, { flapMode: 'flap_close' }),
  ];
}

/**
 * "headlightPingPong" — Only headlights alternate L/R with blink.
 * Params: { durationMs=4000, blinkSpeed=1, cycles=4 }
 * Great for: clean L↔R headlight alternation. Minimal, impactful.
 */
function headlightPingPong(startMs, params = {}) {
  const dur = params.durationMs || 4000;
  const speed = params.blinkSpeed ?? 1;
  const cycles = params.cycles || Math.max(2, Math.round(dur / 600));
  const cycleMs = dur / cycles;
  const events = [];
  for (let i = 0; i < cycles; i++) {
    const t = startMs + i * cycleMs;
    const isLeft = i % 2 === 0;
    events.push(evt(isLeft ? 'left_high_light' : 'right_high_light', t, t + cycleMs, { effect: 'blink', blinkSpeed: speed }));
    events.push(evt(isLeft ? 'left_signature_light' : 'right_signature_light', t, t + cycleMs, { effect: 'blink', blinkSpeed: speed }));
  }
  return events;
}

/**
 * "signatureSweep" — Signature lights alternate L/R with gentle eased solid.
 * Params: { durationMs=4000, cycles=4 }
 * Great for: elegant intros, calm sections, DRL-style ambient lighting.
 */
function signatureSweep(startMs, params = {}) {
  const dur = params.durationMs || 4000;
  const cycles = params.cycles || Math.max(2, Math.round(dur / 800));
  const cycleMs = dur / cycles;
  const events = [];
  for (let i = 0; i < cycles; i++) {
    const t = startMs + i * cycleMs;
    const part = i % 2 === 0 ? 'left_signature_light' : 'right_signature_light';
    events.push(evt(part, t, t + cycleMs, { easeIn: true, easeOut: true }));
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
// JUNIPER-ONLY PATTERNS (Model Y 2024+)
// ═══════════════════════════════════════════════════════════════

/**
 * "juniperCenterPulse" — Front + back center light bars pulse together.
 * Params: { durationMs=6000, pulseSpeed=0 }
 * Great for: sustained ambient layer on Juniper. Use A LOT.
 */
function juniperCenterPulse(startMs, params = {}) {
  const dur = params.durationMs || 6000;
  const speed = params.pulseSpeed ?? 0;
  return JUNIPER_CENTER_BARS.map((part) =>
    evt(part, startMs, startMs + dur, {
      effect: 'pulse',
      pulseSpeed: speed,
      easeIn: true,
      easeOut: true,
    })
  );
}

/**
 * "juniperLedsRainbow" — All 5 interior RGB LEDs cycle rainbow.
 * Params: { durationMs=20000 }
 * Great for: long sustained interior ambiance. Use with VERY long durations.
 */
function juniperLedsRainbow(startMs, params = {}) {
  const dur = params.durationMs || 20000;
  return JUNIPER_INTERIOR_LEDS.map((part) =>
    evt(part, startMs, startMs + dur, {
      effect: 'solid',
      rgbRainbow: true,
      rgbSync: false,
      easeIn: true,
      easeOut: true,
    })
  );
}

/**
 * "juniperLedsSync" — All 5 interior LEDs mirror the exterior lights.
 * Params: { durationMs=20000 }
 * Great for: alternating with rainbow for visual variety.
 */
function juniperLedsSync(startMs, params = {}) {
  const dur = params.durationMs || 20000;
  return JUNIPER_INTERIOR_LEDS.map((part) =>
    evt(part, startMs, startMs + dur, {
      effect: 'solid',
      rgbSync: true,
      rgbRainbow: false,
      easeIn: true,
      easeOut: true,
    })
  );
}

/**
 * "juniperLedsColor" — All 5 interior LEDs solid color.
 * Params: { rgbColor='#ffffff', durationMs=15000 }
 * Great for: themed sections (red=intense, blue=cool, etc.)
 */
function juniperLedsColor(startMs, params = {}) {
  const dur = params.durationMs || 15000;
  const color = params.rgbColor || '#ffffff';
  return JUNIPER_INTERIOR_LEDS.map((part) =>
    evt(part, startMs, startMs + dur, {
      effect: 'solid',
      rgbColor: color,
      rgbRainbow: false,
      rgbSync: false,
      easeIn: true,
      easeOut: true,
    })
  );
}

// ═══════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════

const JUNIPER_ONLY_PATTERN_NAMES = new Set([
  'juniperCenterPulse',
  'juniperLedsRainbow',
  'juniperLedsSync',
  'juniperLedsColor',
]);

const PATTERNS = {
  breathing,
  pulse,
  fullPulse,
  strobe,
  wave,
  pingPong,
  headlightPingPong,
  signatureSweep,
  chase,
  escalation,
  cascade,
  flashHold,
  blinkerRhythm,
  frontBack,
  symmetricPulse,
  windowsDance,
  trunkSequence,
  retroRoundtrip,
  flapSequence,
  juniperCenterPulse,
  juniperLedsRainbow,
  juniperLedsSync,
  juniperLedsColor,
};

/**
 * Expand a choreography plan into full events.
 * @param {Object[]} plan - Array of { pattern, startMs, params? }
 * @param {number} durationMs - Total track duration for clamping
 * @returns {Object[]} Full event array
 */
function expandChoreography(plan, durationMs, carModel = 'model_3') {
  const allEvents = [];
  let idCounter = 1;
  const isJuniper = carModel === 'model_y_juniper';

  // Track closure usage to enforce hardware limits
  const closureCounts = {
    retroRoundtrip: 0,   // max 6 (each = 1 retro_left + 1 retro_right)
    windowsDance: 0,     // max 2
    trunkSequence: 0,    // max 1
    flapSequence: 0,     // max 1
  };
  const CLOSURE_MAX = {
    retroRoundtrip: 6,
    windowsDance: 2,
    trunkSequence: 1,
    flapSequence: 1,
  };

  for (const instruction of plan) {
    // Gate Juniper-only patterns: silently ignored on non-Juniper cars so an
    // LLM hallucination can't inject interior LED events onto a Model 3.
    if (JUNIPER_ONLY_PATTERN_NAMES.has(instruction.pattern) && !isJuniper) {
      continue;
    }

    const fn = PATTERNS[instruction.pattern];
    if (!fn) {
      console.warn(`[Patterns] Unknown pattern: "${instruction.pattern}", skipping`);
      continue;
    }

    // Enforce closure limits
    if (instruction.pattern in CLOSURE_MAX) {
      if (closureCounts[instruction.pattern] >= CLOSURE_MAX[instruction.pattern]) {
        continue; // Skip — hardware limit reached
      }
      closureCounts[instruction.pattern]++;
    }

    const startMs = Math.max(0, Math.round(instruction.startMs || 0));
    const params = instruction.params || {};
    const events = fn(startMs, params);

    for (const e of events) {
      // Clamp to track bounds
      e.startMs = Math.max(0, Math.round(e.startMs));
      e.endMs = Math.min(durationMs, Math.round(e.endMs));
      if (e.endMs <= e.startMs) continue;
      e.id = `ai_${idCounter++}`;
      e.power = 100;
      allEvents.push(e);
    }
  }

  let sorted = allEvents.sort((a, b) => a.startMs - b.startMs).slice(0, 5000);
  if (isJuniper) sorted = remapEventsToJuniper(sorted);
  return sorted;
}

// Remap Model 3 front-light parts to Juniper equivalents (4 front parts → 2)
// and drop duplicates at the same part/time that the merge creates.
function remapEventsToJuniper(events) {
  const MAP = {
    left_high_light: 'light_left_front',
    right_high_light: 'light_right_front',
    left_signature_light: 'light_left_front',
    right_signature_light: 'light_right_front',
  };
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const mappedPart = MAP[e.part] || e.part;
    const key = `${mappedPart}|${e.startMs}|${e.endMs}|${e.effect}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mappedPart === e.part ? e : { ...e, part: mappedPart });
  }
  return out;
}

/**
 * Get the pattern catalog description for the LLM prompt.
 * Juniper-specific patterns are appended only when the target is Juniper —
 * this keeps the Model 3 prompt surface unchanged.
 */
function getPatternCatalog(carModel = 'model_3') {
  const base = `
## LIGHT PATTERNS (effect on lights only, no moving parts)
- **breathing** — Gentle headlight+signature+taillight fade in/out. Params: {durationMs:3000}. 6 events. Good for: intros, outros, quiet.
- **pulse** — Short headlight+signature+taillight burst. Params: {durationMs:300}. 6 events. Good for: marking single beats.
- **fullPulse** — All 15 lights short burst. Params: {durationMs:300}. 15 events. Good for: strong beats, accents.
- **strobe** — All 15 lights blink fast. Params: {durationMs:1000, blinkSpeed:2}. 15 events. Good for: peaks, climax.
- **wave** — Sequential sweep front→back. Params: {stagger:200, holdMs:600, reverse:false}. 12 events. Good for: transitions.
- **pingPong** — Left/right sides alternate blinking back and forth (true L↔R bounce). Params: {durationMs:4000, blinkSpeed:1, cycles:4}. Good for: rhythmic sections. USE THIS A LOT with durationMs=3000-6000.
- **headlightPingPong** — Headlights + signature alternate L/R blink (clean, impactful). Params: {durationMs:4000, blinkSpeed:1}. Good for: verses, moderate energy. USE THIS for clean headlight L↔R effect.
- **signatureSweep** — Signature lights only alternate L/R with gentle eased solid. Params: {durationMs:4000, cycles:4}. Good for: elegant intros, calm sections, ambient DRL-style. USE THIS for subtle, classy effects.
- **chase** — Single light runs around the car. Params: {stepMs:150, holdMs:300, loops:1}. 13 events. Good for: buildups.
- **escalation** — Blink speed 0→1→2 over 3 phases. Params: {phaseDurationMs:1000}. 22 events. Good for: buildups before drops.
- **cascade** — Ultra-fast sweep all 15 parts. Params: {stagger:80}. 15 events. Good for: climax.
- **flashHold** — All lights solid sustained. Params: {durationMs:500}. 15 events. Good for: impact after drops.
- **blinkerRhythm** — 4 blinkers blinking sustained. Params: {durationMs:3000, blinkSpeed:1}. 4 events. Good for: verse rhythm layer.
- **frontBack** — Front blinks then back blinks. Params: {durationMs:3000, blinkSpeed:1}. 13 events. Good for: verse variation.
- **symmetricPulse** — Headlights+signature+taillights blink + sides blink faster. Params: {durationMs:3000, blinkSpeed:1}. 10 events. Good for: chorus.

## CLOSURE PATTERNS (moving parts — use sparingly)
- **windowsDance** — All 4 windows dance together. Params: {durationMs:15000}. Max 1-2 uses per show.
- **trunkSequence** — Open + 2s pause + dance ≥10s + close. Params: {openDurationMs:4000, pauseMs:2000, danceDurationMs:12000}. Exactly 1 use, in first half of track.
- **retroRoundtrip** — Both retros fold out and back. Params: {durationMs:2000}. Max 5-6 uses spread across show.
- **flapSequence** — Open → rainbow → close. Params: {openMs:3000, rainbowMs:8000}. Exactly 1 use.
`.trim();

  if (carModel !== 'model_y_juniper') return base;

  const juniperSection = `

## JUNIPER-EXCLUSIVE PATTERNS (Model Y 2024+ only — USE HEAVILY)
- **juniperCenterPulse** — Pulse on the front + back central light bars. Params: {durationMs:6000, pulseSpeed:0}. 2 events. USE OFTEN — every 6-10s throughout the track with durationMs=5000-8000. Signature Juniper effect. pulseSpeed: 0=slow breathing, 1=medium, 2=fast.
- **juniperLedsRainbow** — All 5 interior RGB LEDs in rainbow mode. Params: {durationMs:20000}. 5 events. USE WITH VERY LONG DURATIONS (20-60s). The interior should stay lit almost continuously across the whole show.
- **juniperLedsSync** — All 5 interior LEDs sync with exterior lights (follow the show). Params: {durationMs:20000}. 5 events. Alternate with rainbow for variety across sections.
- **juniperLedsColor** — All 5 interior LEDs solid color. Params: {rgbColor:"#ffaa00", durationMs:15000}. 5 events. For themed sections (#ff2222=intense, #44aaff=cool, #88ff22=energetic).
`.trim();

  return `${base}\n\n${juniperSection}`;
}

module.exports = { PATTERNS, expandChoreography, getPatternCatalog };
