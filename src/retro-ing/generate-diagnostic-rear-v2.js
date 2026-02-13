// Diagnostic .fseq V2 — Rear channels with START MARKER
// Starts with 3 flashes of front DRLs (Ch 0+1) as a sync signal
// Then tests Ch 18-31 one by one: 3s ON, 3s OFF
//
// Usage:  node src/retro-ing/generate-diagnostic-rear-v2.js

const fs = require('fs');
const path = require('path');

const STEP_TIME_MS = 20;
const CHANNEL_COUNT = 48;

// Marker: 3 quick DRL flashes (0.3s ON, 0.3s OFF) × 3, then 2s pause
const FLASH_ON_MS = 300;
const FLASH_OFF_MS = 300;
const FLASH_COUNT = 3;
const MARKER_DURATION_MS = FLASH_COUNT * (FLASH_ON_MS + FLASH_OFF_MS) + 2000;

// Test parameters
const ON_DURATION_MS = 3000;
const OFF_DURATION_MS = 3000;
const CYCLE_MS = ON_DURATION_MS + OFF_DURATION_MS;

const START_CHANNEL = 18;
const END_CHANNEL = 31;
const TEST_CHANNELS = END_CHANNEL - START_CHANNEL + 1;

const TOTAL_DURATION_MS = MARKER_DURATION_MS + TEST_CHANNELS * CYCLE_MS;
const FRAME_COUNT = Math.ceil(TOTAL_DURATION_MS / STEP_TIME_MS);

console.log('Generating REAR diagnostic V2 .fseq (with start marker)');
console.log(`  Marker: ${FLASH_COUNT} DRL flashes then 2s pause`);
console.log(`  Testing channels: ${START_CHANNEL}–${END_CHANNEL} (${TEST_CHANNELS} channels)`);
console.log(`  Per channel: ${ON_DURATION_MS / 1000}s ON + ${OFF_DURATION_MS / 1000}s OFF`);
console.log(`  Total duration: ${(TOTAL_DURATION_MS / 1000).toFixed(1)}s`);
console.log('');

console.log('=== TIMING REFERENCE ===');
console.log(`  0.0s–${(MARKER_DURATION_MS / 1000).toFixed(1)}s : 3 FLASHES DRL (signal de départ)`);
console.log('');
for (let i = 0; i < TEST_CHANNELS; i++) {
  const ch = START_CHANNEL + i;
  const startSec = (MARKER_DURATION_MS + i * CYCLE_MS) / 1000;
  const endSec = startSec + ON_DURATION_MS / 1000;
  console.log(`  Channel ${String(ch).padStart(2, '0')}  →  ${startSec.toFixed(1)}s – ${endSec.toFixed(1)}s`);
}
console.log('========================');
console.log('');

// Build frame data
const data = new Uint8Array(FRAME_COUNT * CHANNEL_COUNT);

for (let frame = 0; frame < FRAME_COUNT; frame++) {
  const posMs = frame * STEP_TIME_MS;

  // Phase 1: Marker — flash DRL channels 0 and 1
  if (posMs < MARKER_DURATION_MS - 2000) {
    const flashCycle = FLASH_ON_MS + FLASH_OFF_MS;
    const inFlash = posMs % flashCycle;
    if (inFlash < FLASH_ON_MS) {
      data[frame * CHANNEL_COUNT + 0] = 255; // DRL left
      data[frame * CHANNEL_COUNT + 1] = 255; // DRL right
    }
    continue;
  }

  // Phase 1b: 2s pause after flashes
  if (posMs < MARKER_DURATION_MS) continue;

  // Phase 2: Sequential rear channel test
  const testPos = posMs - MARKER_DURATION_MS;
  const testIdx = Math.floor(testPos / CYCLE_MS);
  if (testIdx >= TEST_CHANNELS) continue;

  const offsetInCycle = testPos - testIdx * CYCLE_MS;
  const channelIdx = START_CHANNEL + testIdx;

  if (offsetInCycle < ON_DURATION_MS) {
    data[frame * CHANNEL_COUNT + channelIdx] = 255;
  }
}

// Build .fseq V2 header
const header = new Uint8Array(32);
const view = new DataView(header.buffer);
header[0] = 0x50; header[1] = 0x53; header[2] = 0x45; header[3] = 0x51;
view.setUint16(4, 32, true);
header[6] = 0; header[7] = 2;
view.setUint16(8, 32, true);
view.setUint32(10, CHANNEL_COUNT, true);
view.setUint32(14, FRAME_COUNT, true);
header[18] = STEP_TIME_MS;
const ts = Date.now();
for (let i = 0; i < 8; i++) header[24 + i] = (ts >> (i * 8)) & 0xFF;

const fileBytes = Buffer.concat([Buffer.from(header), Buffer.from(data)]);
const outPath = path.join(__dirname, 'diagnostic-rear-v2.fseq');
fs.writeFileSync(outPath, fileBytes);

console.log(`Written: ${outPath}`);
console.log(`File size: ${(fileBytes.length / 1024).toFixed(1)} KB`);
console.log('');
console.log('Instructions:');
console.log('  1. Place-toi derrière la voiture');
console.log('  2. Lance le light show');
console.log('  3. Tu verras 3 flashes des DRL avant = signal de départ');
console.log('  4. Après 2s de pause, les channels arrière défilent un par un');
console.log('  5. Note ce que tu vois à chaque activation');
