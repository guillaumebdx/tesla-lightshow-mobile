// Shared constants for Tesla Light Show Creator

// Interactive mesh parts in the GLB model
export const INTERACTIVE_PARTS = [
  'window_left_front', 'window_right_front',
  'window_left_back', 'window_right_back',
  'retro_left', 'retro_right',
  'flap', 'trunk',
  'light_left_front', 'light_right_front',
  'light_left_back', 'light_right_back',
  'blink_front_left', 'blink_front_right',
  'blink_back_left', 'blink_back_right',
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
  light_left_front: 'Phare AV gauche',
  light_right_front: 'Phare AV droit',
  light_left_back: 'Feu AR gauche',
  light_right_back: 'Feu AR droit',
  blink_front_left: 'Clignotant AV gauche',
  blink_front_right: 'Clignotant AV droit',
  blink_back_left: 'Clignotant AR gauche',
  blink_back_right: 'Clignotant AR droit',
};

// Icon images per part type
export const PART_ICONS = {
  light_left_front: require('../assets/icons/front_light.png'),
  light_right_front: require('../assets/icons/front_light.png'),
  light_left_back: require('../assets/icons/back_light.png'),
  light_right_back: require('../assets/icons/back_light.png'),
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
};

// Color per part type (for event rectangles on waveform)
export const PART_COLORS = {
  light_left_front: '#ffffff',
  light_right_front: '#ffffff',
  light_left_back: '#ff4444',
  light_right_back: '#ff4444',
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
};

// Effect types for events (extensible later with fade, pulse, etc.)
export const EFFECT_TYPES = {
  SOLID: 'solid',     // Constant on for duration
  BLINK: 'blink',     // Rapid on/off alternation
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
  DANCE: 'window_dance',   // Oscillation haut/bas (native Tesla dance)
};

// Max dance duration recommended by Tesla (thermal limits)
export const WINDOW_MAX_DANCE_MS = 30000; // 30s max recommended

// Trunk (coffre) animation modes
export const TRUNK_MODES = {
  OPEN: 'trunk_open',
  CLOSE: 'trunk_close',
  DANCE: 'trunk_dance',    // Must be preceded by an Open event
};

export const TRUNK_DURATIONS = {
  [TRUNK_MODES.OPEN]: 13000,
  [TRUNK_MODES.CLOSE]: 13000,
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

// Closure command limits per show (Tesla-imposed)
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

// Default event options when placing a new event
export const DEFAULT_EVENT_OPTIONS = {
  durationMs: 500,
  effect: EFFECT_TYPES.SOLID,
  power: 100,          // 1-100, maps to 0-255 at export
  blinkSpeed: 0,       // Index into BLINK_SPEEDS
  easeIn: false,       // Fade in at start of event
  easeOut: false,      // Fade out at end of event
  retroMode: RETRO_MODES.ROUND_TRIP, // Default retro animation mode
  windowMode: 'window_dance',         // Default window animation mode
  windowDurationMs: 5000,             // Duration of window dance
  trunkMode: 'trunk_open',            // Default trunk mode
  flapMode: 'flap_open',              // Default flap mode
};

// Helper: is this part a light?
export const isLight = (part) => part && part.includes('light');

// Helper: is this part a turn signal (blinker)?
export const isBlinker = (part) => part && part.includes('blink');

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
