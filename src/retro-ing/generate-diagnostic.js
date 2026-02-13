// Diagnostic .fseq generator — Test all 48 channels one by one
// Each channel: 2s ON at 100%, then 1s OFF before next channel
// Total duration: 48 * 3s = 144s = 2min24
//
// Usage (from project root):
//   node src/retro-ing/generate-diagnostic.js
//
// Output: src/retro-ing/diagnostic-channels.fseq
// Copy this file to USB stick > LightShow folder for Tesla

const fs = require('fs');
const path = require('path');

const STEP_TIME_MS = 20;     // 20ms per frame (50 fps)
const CHANNEL_COUNT = 48;
const ON_DURATION_MS = 2000;  // 2 seconds ON per channel
const OFF_DURATION_MS = 1000; // 1 second OFF between channels
const CYCLE_MS = ON_DURATION_MS + OFF_DURATION_MS;
const TOTAL_DURATION_MS = CHANNEL_COUNT * CYCLE_MS;
const FRAME_COUNT = Math.ceil(TOTAL_DURATION_MS / STEP_TIME_MS);

console.log(`Generating diagnostic .fseq`);
console.log(`  Channels: ${CHANNEL_COUNT}`);
console.log(`  Per channel: ${ON_DURATION_MS}ms ON + ${OFF_DURATION_MS}ms OFF`);
console.log(`  Total duration: ${(TOTAL_DURATION_MS / 1000).toFixed(1)}s`);
console.log(`  Frame count: ${FRAME_COUNT}`);
console.log(`  Frame size: ${CHANNEL_COUNT} bytes`);
console.log('');

// Print timing reference
console.log('=== TIMING REFERENCE (note what activates at each time) ===');
for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
  const startSec = (ch * CYCLE_MS) / 1000;
  const endSec = startSec + ON_DURATION_MS / 1000;
  console.log(`  Channel ${String(ch).padStart(2, '0')}  →  ${startSec.toFixed(1)}s – ${endSec.toFixed(1)}s`);
}
console.log('==========================================================');
console.log('');

// Build frame data
const data = new Uint8Array(FRAME_COUNT * CHANNEL_COUNT); // all zeros

for (let frame = 0; frame < FRAME_COUNT; frame++) {
  const posMs = frame * STEP_TIME_MS;
  const channelIdx = Math.floor(posMs / CYCLE_MS);

  if (channelIdx >= CHANNEL_COUNT) continue;

  const offsetInCycle = posMs - channelIdx * CYCLE_MS;

  if (offsetInCycle < ON_DURATION_MS) {
    // Channel is ON — full brightness
    data[frame * CHANNEL_COUNT + channelIdx] = 255;
  }
  // else: OFF gap, stays 0
}

// Build .fseq V2 header (32 bytes)
const header = new Uint8Array(32);
const view = new DataView(header.buffer);

// Magic: "PSEQ"
header[0] = 0x50; // P
header[1] = 0x53; // S
header[2] = 0x45; // E
header[3] = 0x51; // Q

// Channel data offset (uint16 LE)
view.setUint16(4, 32, true);

// Version: minor=0, major=2
header[6] = 0;
header[7] = 2;

// Variable header offset (uint16 LE)
view.setUint16(8, 32, true);

// Channel count per frame (uint32 LE)
view.setUint32(10, CHANNEL_COUNT, true);

// Frame count (uint32 LE)
view.setUint32(14, FRAME_COUNT, true);

// Step time in ms (uint8)
header[18] = STEP_TIME_MS;

// Flags
header[19] = 0;

// Compression type: 0 = none
header[20] = 0;

// Number of compression blocks
header[21] = 0;

// Number of sparse ranges
header[22] = 0;

// Flags2
header[23] = 0;

// Unique ID (8 bytes)
const ts = Date.now();
for (let i = 0; i < 8; i++) {
  header[24 + i] = (ts >> (i * 8)) & 0xFF;
}

// Combine and write
const fileBytes = Buffer.concat([Buffer.from(header), Buffer.from(data)]);
const outPath = path.join(__dirname, 'diagnostic-channels.fseq');
fs.writeFileSync(outPath, fileBytes);

const fileSizeKB = (fileBytes.length / 1024).toFixed(1);
console.log(`Written: ${outPath}`);
console.log(`File size: ${fileSizeKB} KB`);
console.log('');
console.log('Instructions:');
console.log('  1. Copy diagnostic-channels.fseq to USB > LightShow/');
console.log('  2. Also copy a silent ~2m30 .wav or .mp3 as lightshow.mp3');
console.log('     (or rename the .fseq to lightshow.fseq)');
console.log('  3. Start the light show on the car');
console.log('  4. Start a stopwatch at the same time');
console.log('  5. Note which part activates at each 3-second interval');
console.log('  6. Use the timing reference above to identify channels');
