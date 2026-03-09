/**
 * Coded light show patterns.
 * Each pattern is a function that takes (startMs, params) and returns an array of events.
 * The LLM just picks which patterns to place at which timestamps.
 */

// ─── Part groups ───
const LEFT_LIGHTS = ['light_left_front', 'light_left_back', 'blink_front_left', 'blink_back_left', 'side_repeater_left'];
const RIGHT_LIGHTS = ['light_right_front', 'light_right_back', 'blink_front_right', 'blink_back_right', 'side_repeater_right'];
const ALL_LIGHTS = [
  'light_left_front', 'light_right_front', 'light_left_back', 'light_right_back',
  'blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right',
  'side_repeater_left', 'side_repeater_right', 'license_plate', 'brake_lights', 'rear_fog',
];
const FRONT_LIGHTS = ['light_left_front', 'light_right_front', 'blink_front_left', 'blink_front_right'];
const BACK_LIGHTS = ['light_left_back', 'light_right_back', 'blink_back_left', 'blink_back_right', 'brake_lights', 'rear_fog', 'license_plate'];
const HEADLIGHTS = ['light_left_front', 'light_right_front'];
const TAILLIGHTS = ['light_left_back', 'light_right_back'];
const BLINKERS = ['blink_front_left', 'blink_front_right', 'blink_back_left', 'blink_back_right'];
const SIDES = ['side_repeater_left', 'side_repeater_right'];
const ALL_WINDOWS = ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'];

// Wave sweep sequence front → back
const WAVE_SEQUENCE = [
  HEADLIGHTS,                                         // front headlights
  ['blink_front_left', 'blink_front_right'],          // front blinkers
  SIDES,                                              // side repeaters
  TAILLIGHTS,                                         // tail lights
  ['brake_lights', 'rear_fog', 'license_plate'],      // rear accents
];

// Chase sequence around the car
const CHASE_SEQUENCE = [
  'light_left_front', 'blink_front_left', 'side_repeater_left',
  'light_left_back', 'blink_back_left', 'license_plate',
  'blink_back_right', 'light_right_back', 'side_repeater_right',
  'blink_front_right', 'light_right_front',
];

// ─── Helper ───
function evt(part, startMs, endMs, opts = {}) {
  return {
    part,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    effect: opts.effect || 'solid',
    blinkSpeed: opts.blinkSpeed ?? 0,
    easeIn: opts.easeIn || false,
    easeOut: opts.easeOut || false,
    // Closure-specific
    ...(opts.retroMode ? { retroMode: opts.retroMode } : {}),
    ...(opts.windowMode ? { windowMode: opts.windowMode, windowDurationMs: opts.windowDurationMs || 15000 } : {}),
    ...(opts.trunkMode ? { trunkMode: opts.trunkMode } : {}),
    ...(opts.flapMode ? { flapMode: opts.flapMode } : {}),
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
  for (const part of [...HEADLIGHTS, ...TAILLIGHTS]) {
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
  for (const part of [...HEADLIGHTS, ...TAILLIGHTS]) {
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
 * "pingPong" — Left side blinks then right side blinks, creating movement.
 * Params: { durationMs=3000, blinkSpeed=1 }
 * Great for: rhythmic verses and choruses. ~10 events.
 */
function pingPong(startMs, params = {}) {
  const dur = params.durationMs || 3000;
  const speed = params.blinkSpeed ?? 1;
  const half = dur / 2;
  const events = [];
  // First half: left side blinks
  for (const part of LEFT_LIGHTS) {
    events.push(evt(part, startMs, startMs + half, { effect: 'blink', blinkSpeed: speed }));
  }
  // Second half: right side blinks
  for (const part of RIGHT_LIGHTS) {
    events.push(evt(part, startMs + half, startMs + dur, { effect: 'blink', blinkSpeed: speed }));
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
  const parts = [...HEADLIGHTS, ...BLINKERS];
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
  for (const part of [...HEADLIGHTS, ...TAILLIGHTS]) {
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

// ═══════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════

const PATTERNS = {
  breathing,
  pulse,
  fullPulse,
  strobe,
  wave,
  pingPong,
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
};

/**
 * Expand a choreography plan into full events.
 * @param {Object[]} plan - Array of { pattern, startMs, params? }
 * @param {number} durationMs - Total track duration for clamping
 * @returns {Object[]} Full event array
 */
function expandChoreography(plan, durationMs) {
  const allEvents = [];
  let idCounter = 1;

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

  return allEvents.sort((a, b) => a.startMs - b.startMs).slice(0, 5000);
}

/**
 * Get the pattern catalog description for the LLM prompt.
 */
function getPatternCatalog() {
  return `
## LIGHT PATTERNS (effect on lights only, no moving parts)
- **breathing** — Gentle headlight+taillight fade in/out. Params: {durationMs:3000}. 4 events. Good for: intros, outros, quiet.
- **pulse** — Short headlight+taillight burst. Params: {durationMs:300}. 4 events. Good for: marking single beats.
- **fullPulse** — All 13 lights short burst. Params: {durationMs:300}. 13 events. Good for: strong beats, accents.
- **strobe** — All 13 lights blink fast. Params: {durationMs:1000, blinkSpeed:2}. 13 events. Good for: peaks, climax.
- **wave** — Sequential sweep front→back. Params: {stagger:200, holdMs:600, reverse:false}. 10 events. Good for: transitions.
- **pingPong** — Left side blinks then right side blinks. Params: {durationMs:3000, blinkSpeed:1}. 10 events. Good for: rhythmic sections.
- **chase** — Single light runs around the car. Params: {stepMs:150, holdMs:300, loops:1}. 11 events. Good for: buildups.
- **escalation** — Blink speed 0→1→2 over 3 phases. Params: {phaseDurationMs:1000}. 18 events. Good for: buildups before drops.
- **cascade** — Ultra-fast sweep all 13 parts. Params: {stagger:80}. 13 events. Good for: climax.
- **flashHold** — All lights solid sustained. Params: {durationMs:500}. 13 events. Good for: impact after drops.
- **blinkerRhythm** — 4 blinkers blinking sustained. Params: {durationMs:3000, blinkSpeed:1}. 4 events. Good for: verse rhythm layer.
- **frontBack** — Front blinks then back blinks. Params: {durationMs:3000, blinkSpeed:1}. 11 events. Good for: verse variation.
- **symmetricPulse** — Headlights+taillights blink + sides blink faster. Params: {durationMs:3000, blinkSpeed:1}. 8 events. Good for: chorus.

## CLOSURE PATTERNS (moving parts — use sparingly)
- **windowsDance** — All 4 windows dance together. Params: {durationMs:15000}. Max 1-2 uses per show.
- **trunkSequence** — Open + 2s pause + dance ≥10s + close. Params: {openDurationMs:4000, pauseMs:2000, danceDurationMs:12000}. Exactly 1 use, in first half of track.
- **retroRoundtrip** — Both retros fold out and back. Params: {durationMs:2000}. Max 5-6 uses spread across show.
- **flapSequence** — Open → rainbow → close. Params: {openMs:3000, rainbowMs:8000}. Exactly 1 use.
`.trim();
}

module.exports = { PATTERNS, expandChoreography, getPatternCatalog };
