/**
 * Precompute AI audio features (src/audioFeatures.js format) for the built-in tracks.
 * Usage (from repo root): node scripts/generate_track_features.mjs
 *
 * Output: backend/src/data/trackFeatures/<trackId>.json — the backend uses them
 * when a request comes from a built-in track (matched by trackId, or by title +
 * duration for app versions that do not send audio features).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MPEGDecoder } from 'mpg123-decoder';
import { computeAudioFeatures } from '../src/audioFeatures.js';

const MP3_DIR = './assets/mp3';
const OUT_DIR = './backend/src/data/trackFeatures';

function readTrackRegistry() {
  const src = readFileSync(join(MP3_DIR, 'index.js'), 'utf8');
  const tracks = [];
  const re = /id:\s*'([^']+)',\s*title:\s*'([^']+)',[\s\S]*?file:\s*require\('\.\/([^']+\.mp3)'\)/g;
  let m;
  while ((m = re.exec(src))) tracks.push({ id: m[1], title: m[2], file: m[3] });
  return tracks;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const decoder = new MPEGDecoder();
  await decoder.ready;

  for (const track of readTrackRegistry()) {
    const { channelData, samplesDecoded, sampleRate } = decoder.decode(new Uint8Array(readFileSync(join(MP3_DIR, track.file))));
    await decoder.reset();
    const left = channelData[0];
    const right = channelData[1] || left;
    const features = computeAudioFeatures((i) => (left[i] + right[i]) * 0.5, samplesDecoded, sampleRate);
    const durationMs = Math.round((samplesDecoded / sampleRate) * 1000);
    writeFileSync(join(OUT_DIR, `${track.id}.json`), JSON.stringify({ id: track.id, title: track.title, durationMs, features }));
    console.log(`${track.id}: ${(durationMs / 1000).toFixed(1)}s, ${features.n} frames`);
  }
  decoder.free();
}

main();
