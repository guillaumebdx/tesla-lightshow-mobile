// .fseq V2 export for Tesla Light Show
// Generates an uncompressed .fseq file from timeline events
// Frame interval: 20ms, channelCount: 48 (only 4 used for V1)

import * as FileSystem from 'expo-file-system/legacy';
import { shareAsync } from 'expo-sharing';
import { BLINK_SPEEDS, RETRO_MODES, TRUNK_MODES, FLAP_MODES, WINDOW_MODES, isRetro, isWindow, isTrunk, isFlap, isClosure } from './constants';

// Channel mapping (0-indexed) — confirmed via retro-engineering on Model 3
// Each part maps to an array of channels that should all activate together
const CHANNEL_MAP = {
  light_left_front:  [0, 2, 4, 6, 8, 10],   // DRL + low beam + 4 segments haut gauche
  light_right_front: [1, 3, 5, 7, 9, 11],   // DRL + low beam + 4 segments haut droit
  light_left_back:   [25],                   // feu AR gauche (signature gauche uniquement)
  light_right_back:  [26],                   // feu AR droit (signature droit uniquement)
  blink_front_left:  [12],                   // clignotant AV gauche
  blink_front_right: [13],                   // clignotant AV droit
  blink_back_left:   [22],                   // clignotant AR gauche
  blink_back_right:  [23],                   // clignotant AR droit
};

// Closure channel mapping — official Tesla xLights layout (Tesla Model S.xmodel)
// These use command byte values instead of brightness:
//   0=Idle, 64=Open, 128=Dance, 192=Close, 255=Stop
// Note: ch 30-33 are Falcon/Front Doors (Model S/X only, no effect on Model 3)
// Note: ch 41-44 are Door Handles (Model S only, no effect on Model 3)
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
const CHANNEL_COUNT = 48; // enough to cover all mapped channels

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
function writeClosure(data, ch, startMs, endMs, cmdValue, frameCount) {
  const sf = Math.floor(startMs / STEP_TIME_MS);
  const ef = Math.min(Math.floor(endMs / STEP_TIME_MS), frameCount);
  for (let f = sf; f < ef; f++) {
    data[f * CHANNEL_COUNT + ch] = cmdValue;
  }
}

/**
 * Compile events into a frame×channel matrix.
 * Returns a Uint8Array of size frameCount × channelCount.
 */
function compileFrameData(events, durationMs) {
  const frameCount = Math.ceil(durationMs / STEP_TIME_MS);
  const data = new Uint8Array(frameCount * CHANNEL_COUNT); // initialized to 0

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
          const offset = frame * CHANNEL_COUNT + ch;
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
      writeClosure(data, ch, evt.startMs, evt.endMs, cmd.value, frameCount);
    } else if (cmd.type === 'roundtrip') {
      // First half: close (fold), second half: open (unfold back)
      // Retros start unfolded, so roundtrip = fold in → fold out
      const midMs = evt.startMs + Math.floor((evt.endMs - evt.startMs) / 2);
      writeClosure(data, ch, evt.startMs, midMs, CLOSURE_CMD.CLOSE, frameCount);
      writeClosure(data, ch, midMs, evt.endMs, CLOSURE_CMD.OPEN, frameCount);
    }
  }

  return { data, frameCount };
}

/**
 * Build the .fseq V2 binary header (32 bytes).
 */
function buildHeader(frameCount) {
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
  view.setUint32(10, CHANNEL_COUNT, true);

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
 * @returns {Promise<void>}
 */
export async function exportFseq(events, durationMs) {
  if (!durationMs || durationMs <= 0) {
    throw new Error('No audio track loaded');
  }

  const { data, frameCount } = compileFrameData(events, durationMs);
  const header = buildHeader(frameCount);

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

  return { frameCount, channelCount: CHANNEL_COUNT, fileSize: totalSize };
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
