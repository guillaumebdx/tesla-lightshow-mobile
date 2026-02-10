// .fseq V2 export for Tesla Light Show
// Generates an uncompressed .fseq file from timeline events
// Frame interval: 20ms, channelCount: 48 (only 4 used for V1)

import * as FileSystem from 'expo-file-system/legacy';
import { shareAsync } from 'expo-sharing';
import { BLINK_SPEEDS } from './constants';

// Channel mapping (0-indexed) — presumed, based on community resources
const CHANNEL_MAP = {
  light_left_front: 0,   // channel 1
  light_right_front: 2,  // channel 3
  light_left_back: 8,    // channel 9
  light_right_back: 9,   // channel 10
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
  const easeDuration = Math.min(evtDuration * 0.3, 300);

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
 * Compile events into a frame×channel matrix.
 * Returns a Uint8Array of size frameCount × channelCount.
 */
function compileFrameData(events, durationMs) {
  const frameCount = Math.ceil(durationMs / STEP_TIME_MS);
  const data = new Uint8Array(frameCount * CHANNEL_COUNT); // initialized to 0

  // Only process light events that have a channel mapping
  const lightEvents = events.filter((evt) => CHANNEL_MAP[evt.part] !== undefined);

  for (let frame = 0; frame < frameCount; frame++) {
    const posMs = frame * STEP_TIME_MS;

    for (const evt of lightEvents) {
      const intensity = computeIntensity(evt, posMs);
      if (intensity > 0) {
        const channelIdx = CHANNEL_MAP[evt.part];
        const offset = frame * CHANNEL_COUNT + channelIdx;
        // Take the max if multiple events overlap on the same channel
        const value = Math.round(intensity * 255);
        data[offset] = Math.max(data[offset], value);
      }
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
    throw new Error('Aucune piste audio chargée');
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
    dialogTitle: 'Exporter le Light Show',
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
