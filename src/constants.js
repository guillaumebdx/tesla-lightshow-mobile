// Shared constants for Tesla Light Show Creator

// Interactive mesh parts in the GLB model
export const INTERACTIVE_PARTS = [
  'window_left_front', 'window_right_front',
  'window_left_back', 'window_right_back',
  'retro_left', 'retro_right',
  'flap', 'trunk',
  'light_left_front', 'light_right_front',
  'light_left_back', 'light_right_back',
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
};

// Emoji per part type
export const PART_EMOJIS = {
  window_left_front: '🪟',
  window_right_front: '🪟',
  window_left_back: '🪟',
  window_right_back: '🪟',
  retro_left: '🪞',
  retro_right: '🪞',
  flap: '⚡',
  trunk: '📦',
  light_left_front: '💡',
  light_right_front: '💡',
  light_left_back: '🔴',
  light_right_back: '🔴',
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
  DOWN: 'window_down',   // Descente
  UP: 'window_up',       // Montée
};

// Full open/close = 3s. Duration slider controls how long the window stays in motion.
export const WINDOW_FULL_DURATION = 3000; // 3s for full travel

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
  windowMode: 'window_down',          // Default window animation mode
  windowDurationMs: 3000,             // Duration of window travel
};

// Helper: is this part a light?
export const isLight = (part) => part && part.includes('light');

// Helper: is this part a retro mirror?
export const isRetro = (part) => part && part.includes('retro');

// Helper: is this part a window?
export const isWindow = (part) => part && part.includes('window');

// Helper: can this part be placed on the timeline?
export const isAnimatable = (part) => isLight(part) || isRetro(part) || isWindow(part);
