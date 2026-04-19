// Auto-generated demo show index
// Maps track IDs to their pre-made light show data

export const jingle_bells_demo = require('./jingle_bells.json');
export const jingle_bells_metal_demo = require('./jingle_bells_metal.json');
export const new_year_countdown_demo = require('./new_year_countdown.json');
export const halloween_demo = require('./halloween.json');
export const happy_birthday_demo = require('./happy_birthday.json');
export const classical_piano_demo = require('./classical_piano.json');
export const moonlight_mambo_demo = require('./moonlight_mambo.json');
export const star_wars_battle_demo = require('./star_wars_battle.json');

export const DEMO_SHOWS = {
  'jingle_bells': jingle_bells_demo,
  'jingle_bells_metal': jingle_bells_metal_demo,
  'new_year_countdown': new_year_countdown_demo,
  'halloween': halloween_demo,
  'happy_birthday': happy_birthday_demo,
  'classical_piano': classical_piano_demo,
  'moonlight_mambo': moonlight_mambo_demo,
  'star_wars_battle': star_wars_battle_demo,
};

// Model 3 part → Juniper equivalent. Juniper has 2 front headlights
// (vs Model 3's 4: high + signature, left + right).
const MODEL3_TO_JUNIPER_PART = {
  left_high_light: 'light_left_front',
  right_high_light: 'light_right_front',
  left_signature_light: 'light_left_front',
  right_signature_light: 'light_right_front',
};

// Interior RGB LED parts on Juniper.
const JUNIPER_LED_PARTS = [
  'interior_front_door_left',
  'interior_front_door_right',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
];

// Build the Juniper-specific extras (center light bars + interior LEDs)
// as long sustained events spread across the whole track.
function buildJuniperExtras(trackEndMs) {
  const extras = [];
  let idCounter = 1;
  const nextId = () => `jx_${idCounter++}`;

  // Center bars: tiled pulse blocks (slow breathing) with tiny gaps between.
  const barSegMs = 6000;
  const barGapMs = 400;
  for (let t = 0; t < trackEndMs; t += barSegMs + barGapMs) {
    const segEnd = Math.min(t + barSegMs, trackEndMs);
    if (segEnd - t < 1500) break;
    for (const part of ['light_center_front', 'light_center_back']) {
      extras.push({
        id: nextId(),
        part,
        startMs: t,
        endMs: segEnd,
        effect: 'pulse',
        power: 100,
        blinkSpeed: 0,
        pulseSpeed: 0,
        easeIn: true,
        easeOut: true,
        retroMode: 'roundtrip',
        windowMode: 'window_dance',
        windowDurationMs: 10000,
        trunkMode: 'trunk_open',
        flapMode: 'flap_open',
        rgbColor: '#ffffff',
        rgbRainbow: false,
        rgbSync: false,
      });
    }
  }

  // Interior LEDs: long 12s blocks, alternate rainbow ↔ music sync across the track.
  const ledSegMs = 12000;
  const ledGapMs = 600;
  let segIdx = 0;
  for (let t = 0; t < trackEndMs; t += ledSegMs + ledGapMs) {
    const segEnd = Math.min(t + ledSegMs, trackEndMs);
    if (segEnd - t < 3000) break;
    const useRainbow = segIdx % 2 === 0;
    for (const part of JUNIPER_LED_PARTS) {
      extras.push({
        id: nextId(),
        part,
        startMs: t,
        endMs: segEnd,
        effect: 'solid',
        power: 100,
        blinkSpeed: 0,
        pulseSpeed: 0,
        easeIn: true,
        easeOut: true,
        retroMode: 'roundtrip',
        windowMode: 'window_dance',
        windowDurationMs: 10000,
        trunkMode: 'trunk_open',
        flapMode: 'flap_open',
        rgbColor: '#ffffff',
        rgbRainbow: useRainbow,
        rgbSync: !useRainbow,
      });
    }
    segIdx++;
  }

  return extras;
}

// Resolve a demo for a given track + car model. For Juniper, remap Model 3
// front-light parts and append procedural center-bar + LED events.
export function getDemoForCar(trackId, carModel) {
  const base = DEMO_SHOWS[trackId];
  if (!base) return null;
  if (carModel !== 'model_y_juniper') return base;

  const mapped = (base.events || []).map((e) => {
    const newPart = MODEL3_TO_JUNIPER_PART[e.part] || e.part;
    return newPart === e.part ? e : { ...e, part: newPart };
  });

  // Dedupe collisions caused by 4→2 front-light mapping (same part + timing).
  const seen = new Set();
  const deduped = mapped.filter((e) => {
    const key = `${e.part}|${e.startMs}|${e.endMs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const trackEndMs = deduped.reduce((m, e) => Math.max(m, e.endMs || 0), 0);
  const extras = trackEndMs > 2000 ? buildJuniperExtras(trackEndMs) : [];

  return {
    ...base,
    events: [...deduped, ...extras].sort((a, b) => a.startMs - b.startMs),
  };
}
