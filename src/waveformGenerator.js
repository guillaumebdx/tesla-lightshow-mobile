/**
 * MP3 waveform generator for React Native.
 * Uses js-mp3 (pure JS decoder) to decode MP3 → PCM, then computes RMS bars.
 * Produces the same format as generate_waveforms.mjs: { bars: [0-1], duration }
 */
import * as FileSystem from 'expo-file-system/legacy';
import Mp3 from 'js-mp3';

const NUM_BARS = 2000;

/**
 * Read a file URI into an ArrayBuffer.
 */
async function readFileAsArrayBuffer(uri) {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Yield to the UI thread so React can render animation frames.
 */
function yieldToUI() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Generate waveform data from an MP3 file URI.
 * Returns { bars: number[], duration: number } matching the existing format.
 */
export async function generateWaveform(fileUri) {
  // Step 1: read file (async, UI stays responsive)
  const mp3Buffer = await readFileAsArrayBuffer(fileUri);

  // Yield so the loader animation can render before the blocking decode
  await yieldToUI();

  // Step 2: decode MP3 → PCM (synchronous, blocks JS thread)
  const decoder = Mp3.newDecoder(mp3Buffer);
  const pcmBuffer = decoder.decode();

  if (!pcmBuffer || pcmBuffer.byteLength === 0) {
    throw new Error('Failed to decode MP3');
  }

  await yieldToUI();

  // PCM data is 16-bit signed interleaved stereo at 44100Hz (js-mp3 default)
  const samples = new Int16Array(pcmBuffer);
  const sampleRate = 44100;
  const numChannels = 2;
  const totalMonoSamples = Math.floor(samples.length / numChannels);
  const duration = totalMonoSamples / sampleRate;

  // Step 3: compute RMS per bar (use left channel)
  const samplesPerBar = Math.max(1, Math.floor(totalMonoSamples / NUM_BARS));
  const numBars = Math.min(NUM_BARS, Math.ceil(totalMonoSamples / samplesPerBar));

  const bars = [];
  for (let i = 0; i < numBars; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, totalMonoSamples);
    let sum = 0;
    for (let j = start; j < end; j++) {
      const v = samples[j * numChannels] / 32768; // normalize to -1..1
      sum += v * v;
    }
    const rms = Math.sqrt(sum / (end - start));
    bars.push(rms);
  }

  // Normalize to 0-1
  const maxRms = Math.max(...bars);
  const normalized = bars.map(v => maxRms > 0 ? Math.round((v / maxRms) * 1000) / 1000 : 0);

  return { bars: normalized, duration };
}
