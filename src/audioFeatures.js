/**
 * Audio features for AI light show generation (format v1).
 *
 * Pure JS, no React Native or Node APIs: shared by the app (imported tracks)
 * and by scripts/generate_track_features.mjs (built-in tracks).
 *
 * Audio is decimated to ~22 kHz and analysed with a 512-point FFT every 256
 * samples (~11.6 ms, centred frames). From a 40-band mel spectrogram we send,
 * per frame, quantized to 0-255 and base64-encoded:
 *   onset    — spectral flux (mean positive log-mel rise), the beat tracker input
 *   lowOnset — same, bands under 200 Hz only (kick / bass hits, used for downbeats)
 *              (both square-root companded: value = (byte / 255)^2 x track max)
 *   low, mid, high — band energies in dB (70 dB range, one reference for all
 *                    three), used for loudness and song structure
 * A 4 min track is about 5 x 28 KB.
 */

const N_FFT = 512;
const N_MELS = 40;
const DB_RANGE = 70;
const TARGET_SR = 22050;

function hzToMel(f) { return 2595 * Math.log10(1 + f / 700); }
function melToHz(m) { return 700 * (10 ** (m / 2595) - 1); }

function melFilterbank(sr) {
  const nBins = N_FFT / 2 + 1;
  const fMax = Math.min(11000, sr / 2);
  const mMin = hzToMel(30);
  const mMax = hzToMel(fMax);
  const centers = [];
  for (let i = 0; i < N_MELS + 2; i++) centers.push(melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)));
  const binHz = sr / N_FFT;
  const filters = [];
  for (let m = 0; m < N_MELS; m++) {
    const lo = centers[m];
    const c = centers[m + 1];
    const hi = centers[m + 2];
    const w = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) {
      const f = k * binHz;
      if (f > lo && f < hi) w[k] = f <= c ? (f - lo) / (c - lo) : (hi - f) / (hi - c);
    }
    // Low mel bands can fall between FFT bins: give them their nearest bin.
    if (w.every((v) => v === 0)) w[Math.min(nBins - 1, Math.round(c / binHz))] = 1;
    filters.push({ w, center: c });
  }
  return filters;
}

// In-place iterative radix-2 complex FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function toBase64(bytes) {
  let bin = '';
  const CHUNK = 0x1000; // small apply() batches: safe for Hermes argument limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Square-root companding keeps precision on the many small values (decode: (b / 255)^2).
function quantizeSqrt(arr) {
  let max = 1e-9;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  const out = new Uint8Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = Math.min(255, Math.round(Math.sqrt(arr[i] / max) * 255));
  return out;
}

/**
 * Incremental extractor: process frames in chunks so the app can yield to the
 * UI thread between chunks. No decimated copy of the audio is kept in memory.
 */
function createExtractor(getSample, length, sampleRate) {
  // Decimate by an integer factor (sample averaging = crude anti-alias, fine for onsets).
  const dec = Math.max(1, Math.round(sampleRate / TARGET_SR));
  const sr = sampleRate / dec;
  const len = Math.floor(length / dec);
  const x = (j) => {
    let s = 0;
    for (let k = 0; k < dec; k++) s += getSample(j * dec + k);
    return s / dec;
  };

  const hop = N_FFT / 2;
  const n = Math.floor(len / hop) + 1;
  const window = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  const filters = melFilterbank(sr);
  const nBins = N_FFT / 2 + 1;
  // Sparse filter ranges for speed.
  const ranges = filters.map(({ w }) => {
    let a = 0;
    while (a < nBins && w[a] === 0) a++;
    let b = nBins - 1;
    while (b > a && w[b] === 0) b--;
    return [a, b];
  });

  const onset = new Float64Array(n);
  const lowOnset = new Float64Array(n);
  const low = new Float64Array(n);
  const mid = new Float64Array(n);
  const high = new Float64Array(n);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const power = new Float64Array(nBins);
  let prev = new Float64Array(N_MELS);
  let cur = new Float64Array(N_MELS);
  let t = 0;

  function processFrames(count) {
    const end = Math.min(n, t + count);
    for (; t < end; t++) {
      // Centred frame: samples [t*hop - N/2, t*hop + N/2)
      const start = t * hop - N_FFT / 2;
      for (let i = 0; i < N_FFT; i++) {
        const j = start + i;
        re[i] = j >= 0 && j < len ? x(j) * window[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 0; k < nBins; k++) power[k] = re[k] * re[k] + im[k] * im[k];

      let flux = 0;
      let lowFlux = 0;
      let pl = 0, pm = 0, ph = 0;
      for (let m = 0; m < N_MELS; m++) {
        const { w, center } = filters[m];
        const [a, b] = ranges[m];
        let e = 0;
        for (let k = a; k <= b; k++) e += w[k] * power[k];
        if (center < 200) pl += e; else if (center < 2000) pm += e; else ph += e;
        const db = 10 * Math.log10(e + 1e-10);
        cur[m] = db < -80 ? -80 : db; // floor so silence does not produce flux noise
        if (t > 0) {
          const rise = cur[m] - prev[m];
          if (rise > 0) {
            flux += rise;
            if (center < 200) lowFlux += rise;
          }
        }
      }
      onset[t] = flux / N_MELS;
      lowOnset[t] = lowFlux;
      low[t] = pl; mid[t] = pm; high[t] = ph;
      const tmp = prev; prev = cur; cur = tmp;
    }
    return t >= n;
  }

  function result() {
    let maxE = 1e-12;
    for (let i = 0; i < n; i++) maxE = Math.max(maxE, low[i], mid[i], high[i]);
    const refDb = 10 * Math.log10(maxE);
    const quantizeDb = (arr) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const db = 10 * Math.log10(arr[i] + 1e-12) - refDb;
        const v = Math.round(((db + DB_RANGE) / DB_RANGE) * 255);
        out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      return out;
    };
    return {
      v: 1,
      sr,
      hop,
      hopMs: (hop / sr) * 1000,
      n,
      onset: toBase64(quantizeSqrt(onset)),
      lowOnset: toBase64(quantizeSqrt(lowOnset)),
      low: toBase64(quantizeDb(low)),
      mid: toBase64(quantizeDb(mid)),
      high: toBase64(quantizeDb(high)),
    };
  }

  return { processFrames, result, progress: () => t / n };
}

/**
 * @param {(i: number) => number} getSample - mono sample in [-1, 1] at index i
 * @param {number} length - number of mono samples
 * @param {number} sampleRate
 */
export function computeAudioFeatures(getSample, length, sampleRate) {
  const ex = createExtractor(getSample, length, sampleRate);
  ex.processFrames(Infinity);
  return ex.result();
}

/**
 * Same as computeAudioFeatures, but yields to the event loop between chunks
 * (keeps the app responsive while a long track is analysed).
 * @param {(progress: number) => void} [onProgress] - called with 0..1
 */
export async function computeAudioFeaturesAsync(getSample, length, sampleRate, onProgress) {
  const ex = createExtractor(getSample, length, sampleRate);
  while (!ex.processFrames(1500)) {
    if (onProgress) onProgress(ex.progress());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (onProgress) onProgress(1);
  return ex.result();
}
