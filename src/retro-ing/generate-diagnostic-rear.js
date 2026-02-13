// Diagnostic .fseq generator — Test REAR channels only (Ch 18-31)
// Each channel: 3s ON at 100%, then 2s OFF before next channel
// Longer timing to give time to identify each light from behind the car
//
// Usage (from project root):
//   node src/retro-ing/generate-diagnostic-rear.js
//
// Output: src/retro-ing/diagnostic-rear.fseq

const fs = require('fs');
const path = require('path');

const STEP_TIME_MS = 20;     // 20ms per frame (50 fps)
const CHANNEL_COUNT = 48;
const ON_DURATION_MS = 3000;  // 3 seconds ON per channel
const OFF_DURATION_MS = 2000; // 2 seconds OFF between channels
const CYCLE_MS = ON_DURATION_MS + OFF_DURATION_MS;

// Only test channels 18 to 31 (probable rear lights)
const START_CHANNEL = 18;
const END_CHANNEL = 31;
const TEST_CHANNELS = END_CHANNEL - START_CHANNEL + 1; // 14 channels

const TOTAL_DURATION_MS = TEST_CHANNELS * CYCLE_MS;
const FRAME_COUNT = Math.ceil(TOTAL_DURATION_MS / STEP_TIME_MS);

console.log(`Generating REAR diagnostic .fseq`);
console.log(`  Testing channels: ${START_CHANNEL}–${END_CHANNEL} (${TEST_CHANNELS} channels)`);
console.log(`  Per channel: ${ON_DURATION_MS}ms ON + ${OFF_DURATION_MS}ms OFF`);
console.log(`  Total duration: ${(TOTAL_DURATION_MS / 1000).toFixed(1)}s (${(TOTAL_DURATION_MS / 60000).toFixed(1)} min)`);
console.log(`  Frame count: ${FRAME_COUNT}`);
console.log('');

// Print timing reference
console.log('=== TIMING REFERENCE ===');
console.log('Place-toi derrière la voiture et lance un chrono en même temps');
console.log('');
for (let i = 0; i < TEST_CHANNELS; i++) {
  const ch = START_CHANNEL + i;
  const startSec = (i * CYCLE_MS) / 1000;
  const endSec = startSec + ON_DURATION_MS / 1000;
  console.log(`  Channel ${String(ch).padStart(2, '0')}  →  ${startSec.toFixed(0)}s – ${endSec.toFixed(0)}s`);
}
console.log('========================');
console.log('');

// Build frame data
const data = new Uint8Array(FRAME_COUNT * CHANNEL_COUNT); // all zeros

for (let frame = 0; frame < FRAME_COUNT; frame++) {
  const posMs = frame * STEP_TIME_MS;
  const testIdx = Math.floor(posMs / CYCLE_MS);

  if (testIdx >= TEST_CHANNELS) continue;

  const offsetInCycle = posMs - testIdx * CYCLE_MS;
  const channelIdx = START_CHANNEL + testIdx;

  if (offsetInCycle < ON_DURATION_MS) {
    data[frame * CHANNEL_COUNT + channelIdx] = 255;
  }
}

// Build .fseq V2 header (32 bytes)
const header = new Uint8Array(32);
const view = new DataView(header.buffer);

header[0] = 0x50; // P
header[1] = 0x53; // S
header[2] = 0x45; // E
header[3] = 0x51; // Q
view.setUint16(4, 32, true);
header[6] = 0;
header[7] = 2;
view.setUint16(8, 32, true);
view.setUint32(10, CHANNEL_COUNT, true);
view.setUint32(14, FRAME_COUNT, true);
header[18] = STEP_TIME_MS;
header[19] = 0;
header[20] = 0;
header[21] = 0;
header[22] = 0;
header[23] = 0;
const ts = Date.now();
for (let i = 0; i < 8; i++) {
  header[24 + i] = (ts >> (i * 8)) & 0xFF;
}

// Combine and write
const fileBytes = Buffer.concat([Buffer.from(header), Buffer.from(data)]);
const outPath = path.join(__dirname, 'diagnostic-rear.fseq');
fs.writeFileSync(outPath, fileBytes);

const fileSizeKB = (fileBytes.length / 1024).toFixed(1);
console.log(`Written: ${outPath}`);
console.log(`File size: ${fileSizeKB} KB`);
