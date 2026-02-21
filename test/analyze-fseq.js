// Diagnostic: parse FSEQ binary and validate closure channel activity
// Usage: node test/analyze-fseq.js [path-to-fseq]
const fs = require('fs');
const path = require('path');

const CHANNEL_COUNT = 48;
const STEP_TIME_MS = 20;

const CLOSURE_CHANNELS = {
  34: 'retro_left',       // Left Mirror
  35: 'retro_right',      // Right Mirror
  36: 'window_left_front', // Left Front Window
  37: 'window_left_back',  // Left Rear Window
  38: 'window_right_front',// Right Front Window
  39: 'window_right_back', // Right Rear Window
  40: 'trunk',             // Liftgate
  45: 'flap',              // Charge Port
};

const CMD_NAMES = {
  0: 'IDLE',
  64: 'OPEN',
  128: 'DANCE',
  192: 'CLOSE',
  255: 'STOP',
};

const LIGHT_CHANNELS = {
  25: 'light_left_back',
  26: 'light_right_back',
};

const fseqPath = path.join(__dirname, 'testcomplet.fseq');
const buf = fs.readFileSync(fseqPath);

// Parse header
const magic = buf.toString('ascii', 0, 4);
const dataOffset = buf.readUInt16LE(4);
const channelCount = buf.readUInt32LE(10);
const frameCount = buf.readUInt32LE(14);
const stepTimeMs = buf.readUInt8(18);

console.log('=== FSEQ HEADER ===');
console.log(`Magic: ${magic}`);
console.log(`Data offset: ${dataOffset}`);
console.log(`Channel count: ${channelCount}`);
console.log(`Frame count: ${frameCount}`);
console.log(`Step time: ${stepTimeMs}ms`);
console.log(`Duration: ${(frameCount * stepTimeMs / 1000).toFixed(1)}s`);
console.log('');

const data = buf.slice(dataOffset);

// Dump closure channel activity (transitions only)
console.log('=== CLOSURE CHANNEL ACTIVITY ===');
for (const [chStr, name] of Object.entries(CLOSURE_CHANNELS)) {
  const ch = parseInt(chStr);
  let prevVal = 0;
  const transitions = [];
  for (let f = 0; f < frameCount; f++) {
    const val = data[f * channelCount + ch];
    if (val !== prevVal) {
      transitions.push({ frame: f, timeMs: f * stepTimeMs, from: prevVal, to: val });
      prevVal = val;
    }
  }
  if (transitions.length > 0) {
    console.log(`\nCh ${ch} (${name}):`);
    for (const t of transitions) {
      const fromName = CMD_NAMES[t.from] || t.from;
      const toName = CMD_NAMES[t.to] || t.to;
      console.log(`  ${(t.timeMs/1000).toFixed(2)}s (frame ${t.frame}): ${fromName}(${t.from}) → ${toName}(${t.to})`);
    }
  } else {
    console.log(`Ch ${ch} (${name}): no activity`);
  }
}

// Check light channels around ease in/out events
console.log('\n=== LIGHT CHANNELS: EASE IN/OUT CHECK ===');

// light_left_back: 78923-81773ms, easeIn=true
console.log('\nCh 25 (light_left_back) around 78923-81773ms (easeIn=true):');
const startFrame25 = Math.floor(78923 / STEP_TIME_MS);
for (let f = startFrame25 - 2; f <= startFrame25 + 20 && f < frameCount; f++) {
  const val = data[f * channelCount + 25];
  if (val > 0 || f >= startFrame25) {
    console.log(`  ${(f*STEP_TIME_MS/1000).toFixed(2)}s (frame ${f}): brightness=${val} (${(val/255*100).toFixed(0)}%)`);
  }
}

const endFrame25 = Math.floor(81773 / STEP_TIME_MS);
console.log(`  ... end region:`);
for (let f = endFrame25 - 5; f <= endFrame25 + 2 && f < frameCount; f++) {
  const val = data[f * channelCount + 25];
  console.log(`  ${(f*STEP_TIME_MS/1000).toFixed(2)}s (frame ${f}): brightness=${val} (${(val/255*100).toFixed(0)}%)`);
}

// light_right_back: 87782-91782ms, easeOut=true
console.log('\nCh 26 (light_right_back) around 87782-91782ms (easeOut=true):');
const startFrame26 = Math.floor(87782 / STEP_TIME_MS);
for (let f = startFrame26 - 2; f <= startFrame26 + 5 && f < frameCount; f++) {
  const val = data[f * channelCount + 26];
  console.log(`  ${(f*STEP_TIME_MS/1000).toFixed(2)}s (frame ${f}): brightness=${val} (${(val/255*100).toFixed(0)}%)`);
}

const endFrame26 = Math.floor(91782 / STEP_TIME_MS);
console.log(`  ... end region:`);
for (let f = endFrame26 - 20; f <= endFrame26 + 2 && f < frameCount; f++) {
  const val = data[f * channelCount + 26];
  console.log(`  ${(f*STEP_TIME_MS/1000).toFixed(2)}s (frame ${f}): brightness=${val} (${(val/255*100).toFixed(0)}%)`);
}

// Check if ANY non-zero data exists on unexpected channels during flap rainbow
console.log('\n=== FLAP RAINBOW PERIOD (122828-126828ms) - ALL CHANNELS ===');
const rbStart = Math.floor(122828 / STEP_TIME_MS);
const rbEnd = Math.floor(126828 / STEP_TIME_MS);
for (let ch = 0; ch < channelCount; ch++) {
  let hasActivity = false;
  let sampleVal = 0;
  for (let f = rbStart; f < rbEnd; f++) {
    const val = data[f * channelCount + ch];
    if (val > 0) {
      hasActivity = true;
      sampleVal = val;
      break;
    }
  }
  if (hasActivity) {
    const name = CLOSURE_CHANNELS[ch] || LIGHT_CHANNELS[ch] || `unknown_ch${ch}`;
    console.log(`  Ch ${ch} (${name}): ACTIVE (sample value=${sampleVal}, ${CMD_NAMES[sampleVal] || 'brightness'})`);
  }
}
