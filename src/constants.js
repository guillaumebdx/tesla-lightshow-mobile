// Shared constants for LightShow Studio

// Interactive mesh parts in the GLB model
export const INTERACTIVE_PARTS = [
  'window_left_front', 'window_right_front',
  'window_left_back', 'window_right_back',
  'retro_left', 'retro_right',
  'flap', 'trunk',
  'left_high_light', 'right_high_light',
  'left_signature_light', 'right_signature_light',
  'light_left_front', 'light_right_front',
  'light_center_front',
  'light_left_back', 'light_right_back',
  'light_center_back',
  'blink_front_left', 'blink_front_right',
  'blink_back_left', 'blink_back_right',
  'license_plate',
  'brake_lights',
  'rear_fog',
  'reversing_lights',
  'side_repeater_left', 'side_repeater_right',
  'interior_front_door_right',
  'interior_front_door_left',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
];

// French labels for each part
export const PART_LABELS = {
  window_left_front: 'Vitre AV gauche',
  window_right_front: 'Vitre AV droite',
  window_left_back: 'Vitre AR gauche',
  window_right_back: 'Vitre AR droite',
  retro_left: 'Rétro gauche',
  retro_right: 'Rétro droit',
  flap: 'Trappe de charge',
  trunk: 'Coffre',
  left_high_light: 'Phare AV gauche',
  right_high_light: 'Phare AV droit',
  left_signature_light: 'Signature AV gauche',
  right_signature_light: 'Signature AV droite',
  light_left_front: 'Phare AV gauche',
  light_right_front: 'Phare AV droit',
  light_center_front: 'Barre lumineuse AV',
  light_left_back: 'Feu AR gauche',
  light_right_back: 'Feu AR droit',
  light_center_back: 'Barre lumineuse AR',
  blink_front_left: 'Clignotant AV gauche',
  blink_front_right: 'Clignotant AV droit',
  blink_back_left: 'Clignotant AR gauche',
  blink_back_right: 'Clignotant AR droit',
  license_plate: 'Éclairage plaque',
  brake_lights: 'Feux stop',
  rear_fog: 'Antibrouillard AR',
  reversing_lights: 'Feux de recul',
  side_repeater_left: 'Répétiteur gauche',
  side_repeater_right: 'Répétiteur droit',
  interior_front_door_right: 'LED intérieur porte AV droite',
  interior_front_door_left: 'LED intérieur porte AV gauche',
  interior_front_central: 'LED intérieur centrale AV',
  interior_back_door_left: 'LED intérieur porte AR gauche',
  interior_back_door_right: 'LED intérieur porte AR droite',
};

// Icon images per part type
export const PART_ICONS = {
  left_high_light: require('../assets/icons/front_light.png'),
  right_high_light: require('../assets/icons/front_light.png'),
  left_signature_light: require('../assets/icons/front_light.png'),
  right_signature_light: require('../assets/icons/front_light.png'),
  light_left_front: require('../assets/icons/front_light.png'),
  light_right_front: require('../assets/icons/front_light.png'),
  light_center_front: require('../assets/icons/front_light.png'),
  light_left_back: require('../assets/icons/back_light.png'),
  light_right_back: require('../assets/icons/back_light.png'),
  light_center_back: require('../assets/icons/back_light.png'),
  window_left_front: require('../assets/icons/window.png'),
  window_right_front: require('../assets/icons/window.png'),
  window_left_back: require('../assets/icons/window.png'),
  window_right_back: require('../assets/icons/window.png'),
  retro_left: require('../assets/icons/retro.png'),
  retro_right: require('../assets/icons/retro.png'),
  flap: require('../assets/icons/charge.png'),
  trunk: require('../assets/icons/trunk.png'),
  blink_front_left: require('../assets/icons/front_light.png'),
  blink_front_right: require('../assets/icons/front_light.png'),
  blink_back_left: require('../assets/icons/back_light.png'),
  blink_back_right: require('../assets/icons/back_light.png'),
  license_plate: require('../assets/icons/back_light.png'),
  brake_lights: require('../assets/icons/back_light.png'),
  rear_fog: require('../assets/icons/back_light.png'),
  reversing_lights: require('../assets/icons/back_light.png'),
  side_repeater_left: require('../assets/icons/front_light.png'),
  side_repeater_right: require('../assets/icons/front_light.png'),
  interior_front_door_right: require('../assets/icons/window.png'),
  interior_front_door_left: require('../assets/icons/window.png'),
  interior_front_central: require('../assets/icons/window.png'),
  interior_back_door_left: require('../assets/icons/window.png'),
  interior_back_door_right: require('../assets/icons/window.png'),
};

// Color per part type (for event rectangles on waveform)
export const PART_COLORS = {
  left_high_light: '#ffffff',
  right_high_light: '#ffffff',
  left_signature_light: '#aaddff',
  right_signature_light: '#aaddff',
  light_left_front: '#ffffff',
  light_right_front: '#ffffff',
  light_center_front: '#ffffff',
  light_left_back: '#ff4444',
  light_right_back: '#ff4444',
  light_center_back: '#ff4444',
  window_left_front: '#44aaff',
  window_right_front: '#44aaff',
  window_left_back: '#44aaff',
  window_right_back: '#44aaff',
  retro_left: '#aaaacc',
  retro_right: '#aaaacc',
  flap: '#ffaa00',
  trunk: '#88cc44',
  blink_front_left: '#ffaa00',
  blink_front_right: '#ffaa00',
  blink_back_left: '#ffaa00',
  blink_back_right: '#ffaa00',
  license_plate: '#ccccff',
  brake_lights: '#ff2222',
  rear_fog: '#ff4444',
  reversing_lights: '#ffffff',
  side_repeater_left: '#ffaa00',
  side_repeater_right: '#ffaa00',
  interior_front_door_right: '#cc66ff',
  interior_front_door_left: '#cc66ff',
  interior_front_central: '#cc66ff',
  interior_back_door_left: '#cc66ff',
  interior_back_door_right: '#cc66ff',
};

// Effect types for events (extensible later with fade, pulse, etc.)
export const EFFECT_TYPES = {
  SOLID: 'solid',     // Constant on for duration
  BLINK: 'blink',     // Rapid on/off alternation
  PULSE: 'pulse',     // Sinusoidal brightness oscillation (requires fine PWM)
};

// Retro mirror animation modes
export const RETRO_MODES = {
  CLOSE: 'close',       // Fold in (fermer) — 2s, stays closed
  OPEN: 'open',         // Fold out (ouvrir) — 2s
  ROUND_TRIP: 'roundtrip', // Fold in then out (aller-retour) — 4s
};

export const RETRO_DURATIONS = {
  [RETRO_MODES.CLOSE]: 2000,
  [RETRO_MODES.OPEN]: 2000,
  [RETRO_MODES.ROUND_TRIP]: 4000,
};

// Window animation modes
export const WINDOW_MODES = {
  DANCE: 'window_dance',   // Oscillation haut/bas (native dance)
};

// Max dance duration recommended (thermal limits)
export const WINDOW_MAX_DANCE_MS = 30000; // 30s max recommended

// Trunk (coffre) animation modes
export const TRUNK_MODES = {
  OPEN: 'trunk_open',
  CLOSE: 'trunk_close',
  DANCE: 'trunk_dance',    // Must be preceded by an Open event
};

export const TRUNK_DURATIONS = {
  [TRUNK_MODES.OPEN]: 13000,
  [TRUNK_MODES.CLOSE]: 4000,
  [TRUNK_MODES.DANCE]: 5000,
};

// Charge port (trappe de charge) animation modes
export const FLAP_MODES = {
  OPEN: 'flap_open',
  CLOSE: 'flap_close',
  RAINBOW: 'flap_rainbow',  // Dance = LED arc-en-ciel
};

export const FLAP_DURATIONS = {
  [FLAP_MODES.OPEN]: 2000,
  [FLAP_MODES.CLOSE]: 2000,
  [FLAP_MODES.RAINBOW]: 5000,
};

// Closure command limits per show (vehicle-imposed)
// Each event placed counts as 1 command, except roundtrip = 2 (open+close)
export const CLOSURE_LIMITS = {
  retro_left: 20,
  retro_right: 20,
  window_left_front: 6,
  window_right_front: 6,
  window_left_back: 6,
  window_right_back: 6,
  trunk: 6,
  flap: 3,
};

// How many commands does each mode cost?
export function closureCommandCost(part, event) {
  if (isRetro(part) && event.retroMode === RETRO_MODES.ROUND_TRIP) return 2;
  return 1;
}

// Blink speed levels (full cycle period in ms: on + off)
// Old value was 160ms which was too slow. Slowest new = 80ms (2x faster).
export const BLINK_SPEEDS = [
  { label: '1x', periodMs: 80 },   // Slow (was 2x faster than old)
  { label: '2x', periodMs: 50 },   // Medium
  { label: '3x', periodMs: 30 },   // Fast
];

// Pulse speed levels (full sine cycle period in ms). Slower than blink —
// a pulse needs to breathe visibly while ramping brightness.
export const PULSE_SPEEDS = [
  { label: '1x', periodMs: 1200 }, // Slow breathing
  { label: '2x', periodMs: 700 },  // Medium
  { label: '3x', periodMs: 400 },  // Fast
];

// Parts that support the PULSE effect (need fine per-channel brightness).
// Only the Juniper front light bar qualifies today.
export const PULSE_PARTS = new Set([
  'light_center_front',
  'light_center_back',
  'interior_front_door_right',
  'interior_front_door_left',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
]);

export const supportsPulse = (part) => PULSE_PARTS.has(part);

// Parts that are interior RGB LEDs (3 channels each: R, G, B with fine PWM).
export const RGB_PARTS = new Set([
  'interior_front_door_right',
  'interior_front_door_left',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
]);
export const isRgb = (part) => RGB_PARTS.has(part);

// Parts that only exist on Model Y Juniper — must be filtered out when
// loading a non-Juniper GLB (otherwise shared mesh names like
// `light_right_front` would receive interactive dots on Model 3).
export const JUNIPER_ONLY_PARTS = new Set([
  'light_left_front',
  'light_right_front',
  'light_center_front',
  'light_center_back',
  'reversing_lights',
  'interior_front_door_right',
  'interior_front_door_left',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
]);

// Preset color palette for the interior RGB LED picker.
// 12 values spread across the hue wheel + white.
export const RGB_PRESETS = [
  '#ffffff',
  '#ff2222',
  '#ff7700',
  '#ffcc00',
  '#88ff22',
  '#22ff88',
  '#22ddff',
  '#2277ff',
  '#8822ff',
  '#ee22ff',
  '#ff2288',
  '#ffaadd',
];

// Maximum number of events per show
export const MAX_EVENTS = 5000;

// Default event options when placing a new event
export const DEFAULT_EVENT_OPTIONS = {
  durationMs: 500,
  effect: EFFECT_TYPES.SOLID,
  power: 100,          // 1-100, maps to 0-255 at export
  blinkSpeed: 0,       // Index into BLINK_SPEEDS
  pulseSpeed: 0,       // Index into PULSE_SPEEDS
  easeIn: false,       // Fade in at start of event
  easeOut: false,      // Fade out at end of event
  retroMode: RETRO_MODES.ROUND_TRIP, // Default retro animation mode
  windowMode: 'window_dance',         // Default window animation mode
  windowDurationMs: 5000,             // Duration of window dance
  trunkMode: 'trunk_open',            // Default trunk mode
  flapMode: 'flap_open',              // Default flap mode
  // RGB LED (interior) options — only used when part is an RGB LED
  rgbColor: '#ffffff',     // HEX color
  rgbRainbow: false,       // Rainbow overrides rgbColor
  rgbSync: false,          // Sync with exterior lights (overrides color/rainbow)
};

// Helper: is this part a light?
export const isLight = (part) => part && (part.includes('light') || part === 'license_plate' || part === 'rear_fog' || isRgb(part));

// Helper: is this part a turn signal (blinker)?
export const isBlinker = (part) => part && (part.includes('blink') || part.includes('repeater'));

// Helper: is this part a retro mirror?
export const isRetro = (part) => part && part.includes('retro');

// Helper: is this part a window?
export const isWindow = (part) => part && part.includes('window');

// Helper: is this part a trunk?
export const isTrunk = (part) => part === 'trunk';

// Helper: is this part a charge port flap?
export const isFlap = (part) => part === 'flap';

// Helper: is this part a closure (mechanical)?
export const isClosure = (part) => isRetro(part) || isWindow(part) || isTrunk(part) || isFlap(part);

// Helper: can this part be placed on the timeline?
export const isAnimatable = (part) => isLight(part) || isBlinker(part) || isClosure(part);
