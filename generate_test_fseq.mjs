/**
 * Test FSEQ v3 — Closure channel identification
 * 
 * Phase 1 (0-8s): Quick confirm ch39=trappe, ch40=coffre, ch45=fenêtre AR droite
 * Phase 2 (10-58s): Close command on channels 28-38, 41-44, 46-47 to find mirrors
 * Phase 3 (60-88s): Open command on channels 41-44, 46-47 to find other windows
 * 
 * Run: node generate_test_fseq.mjs
 * Output: test_closures.fseq
 */

import fs from 'fs';

const STEP_TIME_MS = 20;
const CHANNEL_COUNT = 48;
const DURATION_MS = 90_000; // 1m30
const FRAME_COUNT = Math.ceil(DURATION_MS / STEP_TIME_MS);

const OPEN_CMD = 64;
const CLOSE_CMD = 192;
const DANCE_CMD = 128;
const IDLE_CMD = 0;

// Helper: write a command to a channel for a time range
function writeCmd(data, ch, startMs, endMs, cmd) {
  const sf = Math.floor(startMs / STEP_TIME_MS);
  const ef = Math.min(Math.floor(endMs / STEP_TIME_MS), FRAME_COUNT);
  for (let f = sf; f < ef; f++) {
    data[f * CHANNEL_COUNT + ch] = cmd;
  }
  const label = cmd === OPEN_CMD ? 'Open' : cmd === CLOSE_CMD ? 'Close' : cmd === DANCE_CMD ? 'Dance' : `cmd=${cmd}`;
  console.log(`  ch ${ch}: ${(startMs/1000).toFixed(1)}s → ${(endMs/1000).toFixed(1)}s  (${label})`);
}

const data = new Uint8Array(FRAME_COUNT * CHANNEL_COUNT);

const ACTIVE_MS = 2000;
const PAUSE_MS = 500;
const SLOT_MS = ACTIVE_MS + PAUSE_MS;

// Confirmed: ch39=trappe, ch40=coffre, ch45=fenêtre AR droite
const CONFIRMED = new Set([39, 40, 45]);

// ── Phase 1 (0-8s): Quick confirm ──
console.log('\n=== PHASE 1: Quick confirm ===');
writeCmd(data, 39, 0, 2000, OPEN_CMD);       // trappe open
writeCmd(data, 40, 3000, 5000, OPEN_CMD);    // coffre open
writeCmd(data, 45, 3000, 5000, OPEN_CMD);    // fen AR droite open
writeCmd(data, 39, 6000, 8000, CLOSE_CMD);   // trappe close
writeCmd(data, 40, 6000, 8000, CLOSE_CMD);   // coffre close
writeCmd(data, 45, 6000, 8000, CLOSE_CMD);   // fen AR droite close

// ── Phase 2 (10-58s): CLOSE command on unknowns → find mirrors ──
console.log('\n=== PHASE 2: Close command on unknowns (find mirrors) ===');
const unknowns = [];
for (let ch = 28; ch <= 47; ch++) {
  if (!CONFIRMED.has(ch)) unknowns.push(ch);
}

let t = 10000;
unknowns.forEach((ch) => {
  writeCmd(data, ch, t, t + ACTIVE_MS, CLOSE_CMD);
  t += SLOT_MS;
});
console.log(`Phase 2 ends at ${(t/1000).toFixed(1)}s`);

// ── Phase 3 (60-88s): OPEN on channels near 45 → find other windows ──
console.log('\n=== PHASE 3: Open on channels 41-47 (find other windows) ===');
const windowCandidates = [41, 42, 43, 44, 46, 47];
t = 60000;
windowCandidates.forEach((ch) => {
  writeCmd(data, ch, t, t + ACTIVE_MS, OPEN_CMD);
  t += SLOT_MS;
});
console.log(`Phase 3 ends at ${(t/1000).toFixed(1)}s`);

// Build FSEQ V2 header (32 bytes)
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

// Flags, compression, etc. = 0
header[19] = 0;
header[20] = 0;
header[21] = 0;
header[22] = 0;
header[23] = 0;

// Unique ID (timestamp)
const ts = Date.now();
for (let i = 0; i < 8; i++) {
  header[24 + i] = (ts >> (i * 8)) & 0xFF;
}

// Combine and write
const fileBytes = new Uint8Array(header.length + data.length);
fileBytes.set(header, 0);
fileBytes.set(data, header.length);

fs.writeFileSync('test_closures.fseq', fileBytes);
console.log(`\nGenerated test_closures.fseq (${fileBytes.length} bytes, ${FRAME_COUNT} frames)`);
console.log(`\nRename your MP3 to "lightshow.mp3" and this file to "lightshow.fseq"`);
console.log(`Put both in a "LightShow" folder on your USB drive.`);
