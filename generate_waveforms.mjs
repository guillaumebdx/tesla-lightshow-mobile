/**
 * Generate waveform JSON files from MP3s in assets/mp3/
 * Usage: node generate_waveforms.mjs
 * 
 * Outputs: assets/mp3/<filename>.waveform.json
 * Each JSON contains an array of normalized amplitude values (0-1)
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { MPEGDecoder } from 'mpg123-decoder';

const MP3_DIR = './assets/mp3';
const NUM_BARS = 150;  // number of waveform bars to generate

async function generateWaveform(filePath) {
  const mp3Data = readFileSync(filePath);
  const decoder = new MPEGDecoder();
  await decoder.ready;

  const { channelData, samplesDecoded, sampleRate } = decoder.decode(new Uint8Array(mp3Data));
  decoder.free();

  // Use left channel (or mono)
  const samples = channelData[0];
  const totalSamples = samples.length;
  const samplesPerBar = Math.floor(totalSamples / NUM_BARS);

  const bars = [];
  for (let i = 0; i < NUM_BARS; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, totalSamples);

    // RMS amplitude for this chunk
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j] * samples[j];
    }
    const rms = Math.sqrt(sum / (end - start));
    bars.push(rms);
  }

  // Normalize to 0-1
  const maxRms = Math.max(...bars);
  const normalized = bars.map(v => maxRms > 0 ? Math.round((v / maxRms) * 1000) / 1000 : 0);

  return {
    bars: normalized,
    duration: totalSamples / sampleRate,  // seconds
    sampleRate,
    samplesDecoded: totalSamples,
  };
}

async function main() {
  const files = readdirSync(MP3_DIR).filter(f => f.endsWith('.mp3'));

  for (const file of files) {
    const filePath = join(MP3_DIR, file);
    const outPath = join(MP3_DIR, file.replace('.mp3', '.waveform.json'));

    console.log(`Processing: ${file}...`);
    try {
      const waveform = await generateWaveform(filePath);
      writeFileSync(outPath, JSON.stringify(waveform));
      console.log(`  → ${basename(outPath)} (${waveform.bars.length} bars, ${waveform.duration.toFixed(1)}s)`);
    } catch (e) {
      console.error(`  Error: ${e.message}`);
    }
  }

  console.log('\nDone! Waveform JSON files generated.');
}

main();
