// .fseq V2 export for Light Show
// Generates an uncompressed .fseq file from timeline events.
// Frame interval: 20ms. Channel count is 48 on pre-Juniper vehicles and 200
// on Model Y Juniper (validator.py accepts both) — see carModels.js.

import * as FileSystem from 'expo-file-system/legacy';
import { shareAsync } from 'expo-sharing';
import { BLINK_SPEEDS, PULSE_SPEEDS, RETRO_MODES, TRUNK_MODES, FLAP_MODES, WINDOW_MODES, isRetro, isWindow, isTrunk, isFlap, isClosure } from './constants';
import { getChannelCount } from './carModels';

// Channel mapping (0-indexed) — confirmed via retro-engineering
// Each part maps to an array of channels that should all activate together
const CHANNEL_MAP = {
  left_high_light:       [0, 2],              // DRL + low beam gauche (Outer + Inner Main Beam)
  right_high_light:      [1, 3],              // DRL + low beam droit (Outer + Inner Main Beam)
  left_signature_light:  [4, 6, 8, 10],       // Signature gauche (4 segments haut)
  right_signature_light: [5, 7, 9, 11],       // Signature droite (4 segments haut)
  // Juniper combined headlights — fire all left/right front channels together
  light_left_front:  [0, 2, 4, 6, 8, 10],    // Main beam + signature gauche combinés
  light_right_front: [1, 3, 5, 7, 9, 11],    // Main beam + signature droit combinés
  // Juniper front light bar — 60 LEDs blanches individuelles (canaux 47-106,
  // 1-indexés → 46-105 0-indexés). Modélisé comme un seul bloc : même valeur
  // de luminosité écrite sur les 60 canaux. Contrôle fin 0-255 (pas de ramping).
  light_center_front: Array.from({ length: 60 }, (_, i) => 46 + i),
  // Juniper rear light bar — 52 LEDs rouges individuelles (canaux 111-162,
  // 1-indexés → 110-161 0-indexés). Même traitement que le bar avant.
  light_center_back: Array.from({ length: 52 }, (_, i) => 110 + i),
  light_left_back:   [25],                   // feu AR gauche (signature gauche uniquement)
  light_right_back:  [26],                   // feu AR droit (signature droit uniquement)
  blink_front_left:  [12],                   // clignotant AV gauche
  blink_front_right: [13],                   // clignotant AV droit
  blink_back_left:   [22],                   // clignotant AR gauche
  blink_back_right:  [23],                   // clignotant AR droit
  license_plate:     [29],                   // éclairage plaque
  brake_lights:      [24],                   // feux stop (les 3 ensemble)
  rear_fog:          [28],                   // antibrouillard AR
  reversing_lights:  [27],                   // feux de recul (les 2) — blancs, Juniper only
  side_repeater_left:  [20],                 // répétiteur clignotant gauche
  side_repeater_right: [21],                 // répétiteur clignotant droit
};

// Closure channel mapping — official xLights layout (see CLOSURES.md)
// These use command byte values instead of brightness:
//   0=Idle, 64=Open, 128=Dance, 192=Close, 255=Stop
// Note: ch 30-33 are Falcon/Front Doors (not available on compact models)
// Note: ch 41-44 are Door Handles (not available on compact models)
const CLOSURE_MAP = {
  retro_left:         34,  // Left Mirror
  retro_right:        35,  // Right Mirror
  window_left_front:  36,  // Left Front Window
  window_left_back:   37,  // Left Rear Window
  window_right_front: 38,  // Right Front Window
  window_right_back:  39,  // Right Rear Window
  trunk:              40,  // Liftgate
  flap:               45,  // Charge Port
};

const CLOSURE_CMD = {
  IDLE: 0,
  OPEN: 64,
  DANCE: 128,
  CLOSE: 192,
  STOP: 255,
};

const STEP_TIME_MS = 20;

/**
 * Compute the intensity (0–1) of a light event at a given time position.
 * Replicates the same logic as the animation loop in ModelViewer.
 */
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

  // Blink: if off phase, intensity = 0
  if (evt.effect === 'blink') {
    const speedIdx = evt.blinkSpeed ?? 0;
    const periodMs = BLINK_SPEEDS[speedIdx]?.periodMs ?? 80;
    const blinkOff = (Math.floor(elapsed / (periodMs / 2)) % 2) !== 0;
    if (blinkOff) return 0;
  }

  // Pulse: sinusoidal breathing, 0..max..0 per period. Only meaningful on
  // channels with fine PWM (Juniper front light bar). On boolean channels,
  // the vehicle will round-trip through >127 and effectively blink anyway.
  if (evt.effect === 'pulse') {
    const speedIdx = evt.pulseSpeed ?? 0;
    const periodMs = PULSE_SPEEDS[speedIdx]?.periodMs ?? 1200;
    intensity *= 0.5 - 0.5 * Math.cos((elapsed / periodMs) * Math.PI * 2);
  }

  return intensity;
}

/**
 * Determine the closure command byte(s) for a closure event based on its mode.
 * Returns { type: 'single', value } or { type: 'roundtrip' } or null.
 */
function getClosureCommand(evt) {
  const part = evt.part;

  if (isRetro(part)) {
    const mode = evt.retroMode ?? RETRO_MODES.ROUND_TRIP;
    if (mode === RETRO_MODES.OPEN) return { type: 'single', value: CLOSURE_CMD.OPEN };
    if (mode === RETRO_MODES.CLOSE) return { type: 'single', value: CLOSURE_CMD.CLOSE };
    if (mode === RETRO_MODES.ROUND_TRIP) return { type: 'roundtrip' };
  }

  if (isWindow(part)) {
    return { type: 'single', value: CLOSURE_CMD.DANCE };
  }

  if (isTrunk(part)) {
    const mode = evt.trunkMode ?? TRUNK_MODES.OPEN;
    if (mode === TRUNK_MODES.OPEN) return { type: 'single', value: CLOSURE_CMD.OPEN };
    if (mode === TRUNK_MODES.CLOSE) return { type: 'single', value: CLOSURE_CMD.CLOSE };
    if (mode === TRUNK_MODES.DANCE) return { type: 'single', value: CLOSURE_CMD.DANCE };
  }

  if (isFlap(part)) {
    const mode = evt.flapMode ?? FLAP_MODES.OPEN;
    if (mode === FLAP_MODES.OPEN) return { type: 'single', value: CLOSURE_CMD.OPEN };
    if (mode === FLAP_MODES.CLOSE) return { type: 'single', value: CLOSURE_CMD.CLOSE };
    if (mode === FLAP_MODES.RAINBOW) return { type: 'single', value: CLOSURE_CMD.DANCE };
  }

  return null;
}

/**
 * Write a closure command byte to a channel for a time range.
 */
function writeClosure(data, ch, startMs, endMs, cmdValue, frameCount, channelCount) {
  const sf = Math.floor(startMs / STEP_TIME_MS);
  const ef = Math.min(Math.floor(endMs / STEP_TIME_MS), frameCount);
  for (let f = sf; f < ef; f++) {
    data[f * channelCount + ch] = cmdValue;
  }
}

/**
 * Compile events into a frame×channel matrix.
 * Returns a Uint8Array of size frameCount × channelCount.
 */
function compileFrameData(events, durationMs, channelCount) {
  const frameCount = Math.ceil(durationMs / STEP_TIME_MS);
  const data = new Uint8Array(frameCount * channelCount); // initialized to 0

  // Separate light and closure events
  const lightEvents = events.filter((evt) => CHANNEL_MAP[evt.part] !== undefined);
  const closureEvents = events.filter((evt) => CLOSURE_MAP[evt.part] !== undefined);

  // Process light events (brightness 0-255)
  for (let frame = 0; frame < frameCount; frame++) {
    const posMs = frame * STEP_TIME_MS;

    for (const evt of lightEvents) {
      const intensity = computeIntensity(evt, posMs);
      if (intensity > 0) {
        const channels = CHANNEL_MAP[evt.part];
        const value = Math.round(intensity * 255);
        for (const ch of channels) {
          const offset = frame * channelCount + ch;
          data[offset] = Math.max(data[offset], value);
        }
      }
    }
  }

  // Process closure events (command bytes)
  for (const evt of closureEvents) {
    const ch = CLOSURE_MAP[evt.part];
    const cmd = getClosureCommand(evt);
    if (!cmd) continue;

    if (cmd.type === 'single') {
      // Write a single command for the event duration
      writeClosure(data, ch, evt.startMs, evt.endMs, cmd.value, frameCount, channelCount);
    } else if (cmd.type === 'roundtrip') {
      // First half: close (fold), second half: open (unfold back)
      // Retros start unfolded, so roundtrip = fold in → fold out
      const midMs = evt.startMs + Math.floor((evt.endMs - evt.startMs) / 2);
      writeClosure(data, ch, evt.startMs, midMs, CLOSURE_CMD.CLOSE, frameCount, channelCount);
      writeClosure(data, ch, midMs, evt.endMs, CLOSURE_CMD.OPEN, frameCount, channelCount);
    }
  }

  return { data, frameCount };
}

/**
 * Build the .fseq V2 binary header (32 bytes).
 */
function buildHeader(frameCount, channelCount) {
  const header = new Uint8Array(32);
  const view = new DataView(header.buffer);

  // Magic: "PSEQ"
  header[0] = 0x50; // P
  header[1] = 0x53; // S
  header[2] = 0x45; // E
  header[3] = 0x51; // Q

  // Channel data offset (uint16 LE) — right after header
  view.setUint16(4, 32, true);

  // Version: minor=0, major=2
  header[6] = 0; // minor
  header[7] = 2; // major

  // Variable header offset (uint16 LE) — same as data offset (no variable headers)
  view.setUint16(8, 32, true);

  // Channel count per frame (uint32 LE)
  view.setUint32(10, channelCount, true);

  // Frame count (uint32 LE)
  view.setUint32(14, frameCount, true);

  // Step time in ms (uint8)
  header[18] = STEP_TIME_MS;

  // Flags (uint8)
  header[19] = 0;

  // Compression type: 0 = none
  header[20] = 0;

  // Number of compression blocks
  header[21] = 0;

  // Number of sparse ranges
  header[22] = 0;

  // Flags2
  header[23] = 0;

  // Unique ID (8 bytes) — use timestamp
  const ts = Date.now();
  for (let i = 0; i < 8; i++) {
    header[24 + i] = (ts >> (i * 8)) & 0xFF;
  }

  return header;
}

/**
 * Export events to a .fseq file and trigger sharing/download.
 * @param {Array} events - Timeline events
 * @param {number} durationMs - Total audio duration in ms
 * @param {{ carModel?: string }} opts - carModel decides channel count (48 or 200)
 * @returns {Promise<void>}
 */
export async function exportFseq(events, durationMs, opts = {}) {
  if (!durationMs || durationMs <= 0) {
    throw new Error('No audio track loaded');
  }

  const channelCount = getChannelCount(opts.carModel);
  const { data, frameCount } = compileFrameData(events, durationMs, channelCount);
  const header = buildHeader(frameCount, channelCount);

  // Combine header + data
  const totalSize = header.length + data.length;
  const fileBytes = new Uint8Array(totalSize);
  fileBytes.set(header, 0);
  fileBytes.set(data, header.length);

  // Convert to base64 for expo-file-system
  const base64 = uint8ArrayToBase64(fileBytes);

  // Write to temp file
  const filePath = FileSystem.cacheDirectory + 'lightshow.fseq';
  await FileSystem.writeAsStringAsync(filePath, base64, {
    encoding: 'base64',
  });

  // Share/download
  await shareAsync(filePath, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Export Light Show',
    UTI: 'public.data',
  });

  return { frameCount, channelCount, fileSize: totalSize };
}

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Use btoa if available, otherwise manual
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Fallback for React Native
  const { encode } = require('base-64');
  return encode(binary);
}
