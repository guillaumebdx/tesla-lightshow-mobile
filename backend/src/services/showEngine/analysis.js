/**
 * Music analysis for the light show engine.
 *
 * Input: either audio features v1 (3 band energies every ~11.6 ms, see
 * src/audioFeatures.js) or the legacy waveform (N RMS bars over the track,
 * sent by app versions that predate audio features).
 *
 * Output: tempo, beat grid with bars and downbeats, sections with repetition
 * labels and energy levels, onsets, silences and key moments. Everything the
 * renderer places is derived from this grid, never from LLM timestamps.
 */

const FPS = 100; // internal analysis grid: 10 ms
const FRAME_MS = 1000 / FPS;

// ─── small DSP helpers ───

function gaussianSmooth(arr, sigma) {
  if (sigma < 0.5) return Float64Array.from(arr);
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  let ksum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    ksum += w;
  }
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < arr.length) s += arr[j] * kernel[k + radius];
    }
    out[i] = s / ksum;
  }
  return out;
}

function movingAverage(arr, halfWidth) {
  const out = new Float64Array(arr.length);
  let s = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.max(0, i - halfWidth);
    const b = Math.min(arr.length - 1, i + halfWidth);
    while (hi < b) s += arr[++hi];
    while (lo < a) s -= arr[lo++];
    out[i] = s / (hi - lo + 1);
  }
  return out;
}

function mean(arr, a = 0, b = arr.length) {
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += arr[i];
  return s / (b - a);
}

function std(arr) {
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return Math.sqrt(s / Math.max(1, arr.length));
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function fromBase64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Linear resample of a series sampled at times (i + offset) * stepMs onto the 10 ms grid.
function resampleToGrid(values, stepMs, offset, numFrames) {
  const out = new Float64Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const x = (f * FRAME_MS) / stepMs - offset;
    const i = Math.floor(x);
    const frac = x - i;
    const a = values[Math.max(0, Math.min(values.length - 1, i))];
    const b = values[Math.max(0, Math.min(values.length - 1, i + 1))];
    out[f] = a + (b - a) * frac;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// 1. Input decoding → loudness (dB, 0..70) and onset strength on the 10 ms grid
// ═══════════════════════════════════════════════════════════════

const DB_RANGE = 70;

const FEATURE_KEYS = ['onset', 'lowOnset', 'low', 'mid', 'high'];

function isValidFeatures(f) {
  return !!f && f.v === 1 && typeof f.hopMs === 'number' && f.hopMs > 1 && f.hopMs < 100
    && FEATURE_KEYS.every((k) => typeof f[k] === 'string' && f[k].length > 0);
}

function signalsFromFeatures(features, durationMs) {
  const bytes = Object.fromEntries(FEATURE_KEYS.map((k) => [k, fromBase64(features[k])]));
  const n = Math.min(...FEATURE_KEYS.map((k) => bytes[k].length));
  const hopMs = features.hopMs;
  const numFrames = Math.ceil(Math.min(durationMs, n * hopMs) / FRAME_MS);

  const expand = (b) => Float64Array.from(b.subarray(0, n), (v) => (v / 255) ** 2);
  const toDb = (b) => Float64Array.from(b.subarray(0, n), (v) => (v / 255) * DB_RANGE);
  const bands = [toDb(bytes.low), toDb(bytes.mid), toDb(bytes.high)];

  // Overall loudness: power-sum of the 3 bands, back in dB.
  const loud = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = 10 ** (bands[0][i] / 10) + 10 ** (bands[1][i] / 10) + 10 ** (bands[2][i] / 10);
    loud[i] = 10 * Math.log10(p);
  }
  let maxLoud = -Infinity;
  for (let i = 0; i < n; i++) if (loud[i] > maxLoud) maxLoud = loud[i];
  for (let i = 0; i < n; i++) loud[i] = Math.max(0, loud[i] - maxLoud + DB_RANGE);

  // High band rise, only used to tell "high" hits (hats, claps) from "low" ones.
  const highRise = new Float64Array(n);
  for (let i = 1; i < n; i++) highRise[i] = Math.max(0, bands[2][i] - bands[2][i - 1]) / DB_RANGE;

  // Frames are centred on i * hop (same convention as the device extractor).
  return {
    numFrames,
    loudness: resampleToGrid(loud, hopMs, 0, numFrames),
    onset: resampleToGrid(expand(bytes.onset), hopMs, 0, numFrames),
    lowOnset: resampleToGrid(expand(bytes.lowOnset), hopMs, 0, numFrames),
    highOnset: resampleToGrid(highRise, hopMs, 0, numFrames),
    bands: bands.map((b) => resampleToGrid(b, hopMs, 0, numFrames)),
    resolutionMs: hopMs,
  };
}

function signalsFromWaveform(waveform, durationMs) {
  const n = waveform.length;
  const stepMs = durationMs / n;
  const numFrames = Math.ceil(durationMs / FRAME_MS);
  const db = Float64Array.from(waveform, (v) => {
    const x = typeof v === 'number' && v > 0 ? v : 0;
    return Math.max(0, 20 * Math.log10(x + 1e-6) + DB_RANGE);
  });
  // Rise between consecutive bars, placed at the boundary between them.
  const onsetBars = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const rise = db[i] - db[i - 1];
    onsetBars[i] = db[i] > 15 && rise > 0 ? rise : 0;
  }
  const onset = new Float64Array(numFrames);
  for (let i = 1; i < n; i++) {
    const f = Math.round((i * stepMs) / FRAME_MS);
    if (f < numFrames) onset[f] += onsetBars[i];
  }
  const smoothed = gaussianSmooth(onset, Math.max(1, stepMs / FRAME_MS / 3));
  const loud = resampleToGrid(db, stepMs, 0.5, numFrames);
  return {
    numFrames,
    loudness: loud,
    onset: smoothed,
    lowOnset: smoothed,
    highOnset: smoothed,
    bands: null,
    resolutionMs: stepMs,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. Tempo (autocorrelation + log-Gaussian prior) and beat tracking (DP)
// ═══════════════════════════════════════════════════════════════

function normalizeOnset(onset) {
  // Subtract a local mean (removes slow loudness swells), rectify, unit std.
  const local = movingAverage(onset, Math.round(0.4 * FPS));
  const out = new Float64Array(onset.length);
  for (let i = 0; i < onset.length; i++) out[i] = Math.max(0, onset[i] - local[i]);
  const s = std(out) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= s;
  return out;
}

function autocorrelation(x, a, b, minLag, maxLag) {
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = a + lag; i < b; i++) s += x[i] * x[i - lag];
    ac[lag] = s / Math.max(1, b - a - lag);
  }
  return ac;
}

const MIN_BPM = 50;
const MAX_BPM = 200;

/**
 * Global tempo. Returns the beat period in frames (fractional) and a clarity score.
 * Light shows read best with a beat between ~80 and ~160 BPM, so the prior is
 * centred on 115 BPM.
 */
function estimateTempo(ose, a = 0, b = ose.length) {
  const minLag = Math.floor((60 / MAX_BPM) * FPS);
  const maxLag = Math.ceil((60 / MIN_BPM) * FPS);
  const ac = autocorrelation(ose, a, b, Math.max(2, Math.floor(minLag / 2)), Math.min(b - a - 1, maxLag * 2));
  const ac0 = mean(Array.from(ose.slice(a, b), (v) => v * v)) || 1;
  const at = (lag) => {
    const i = Math.floor(lag);
    const f = lag - i;
    if (i + 1 >= ac.length) return 0;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };
  let best = { lag: 0.5 * FPS, score: -Infinity };
  const candidates = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (lag + 1 >= ac.length) break;
    const bpm = (60 * FPS) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.9) ** 2);
    // Reward periodicity that also holds at 2x the lag (bar-level regularity).
    const score = prior * (at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag / 2));
    candidates.push({ lag, score });
    if (score > best.score) best = { lag, score };
  }
  // Parabolic refinement of the peak.
  const i = candidates.findIndex((c) => c.lag === best.lag);
  let lag = best.lag;
  if (i > 0 && i < candidates.length - 1) {
    const y0 = candidates[i - 1].score;
    const y1 = candidates[i].score;
    const y2 = candidates[i + 1].score;
    const d = y0 - 2 * y1 + y2;
    if (d < 0) lag = best.lag + (0.5 * (y0 - y2)) / d;
  }
  const clarity = Math.max(0, Math.min(1, at(Math.round(lag)) / ac0));
  return { periodFrames: lag, bpm: (60 * FPS) / lag, clarity };
}

/**
 * Dynamic-programming beat tracker (Ellis 2007). Finds the beat sequence that
 * maximises onset strength at the beats while keeping inter-beat intervals
 * close to the target period.
 */
function trackBeats(ose, periodFrames, tightness = 100) {
  const n = ose.length;
  const local = gaussianSmooth(ose, Math.max(1, periodFrames / 32));
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const minPrev = Math.round(periodFrames / 2);
  const maxPrev = Math.round(periodFrames * 2);
  for (let t = 0; t < n; t++) {
    let bestVal = -Infinity;
    let bestIdx = -1;
    for (let d = minPrev; d <= maxPrev; d++) {
      const tau = t - d;
      if (tau < 0) break;
      const v = score[tau] - tightness * Math.log(d / periodFrames) ** 2;
      if (v > bestVal) { bestVal = v; bestIdx = tau; }
    }
    score[t] = local[t] + (bestIdx >= 0 ? Math.max(0, bestVal) : 0);
    back[t] = bestVal > 0 ? bestIdx : -1;
  }
  // Start from the best-scoring frame within the last period.
  let t = n - 1;
  let bestEnd = -Infinity;
  for (let k = Math.max(0, n - Math.round(periodFrames)); k < n; k++) {
    if (score[k] > bestEnd) { bestEnd = score[k]; t = k; }
  }
  const beats = [];
  while (t >= 0) {
    beats.push(t);
    t = back[t];
  }
  beats.reverse();
  return { beats, local };
}

// ═══════════════════════════════════════════════════════════════
// 3. Main entry
// ═══════════════════════════════════════════════════════════════

function analyzeMusic({ features, waveform, durationMs }) {
  const useFeatures = isValidFeatures(features);
  const sig = useFeatures ? signalsFromFeatures(features, durationMs) : signalsFromWaveform(waveform, durationMs);
  const n = sig.numFrames;
  const ose = normalizeOnset(sig.onset);

  // ── Music span (skip leading/trailing silence) ──
  const loudSmooth = gaussianSmooth(sig.loudness, 5);
  const peakLoud = percentile(Array.from(loudSmooth), 0.98);
  const silenceDb = peakLoud - 35;
  let startF = 0;
  while (startF < n - 1 && loudSmooth[startF] < silenceDb) startF++;
  let endF = n - 1;
  while (endF > startF && loudSmooth[endF] < silenceDb) endF--;

  // ── Tempo + beats ──
  const tempo = estimateTempo(ose, startF, endF + 1);
  const { beats: rawBeats, local } = trackBeats(ose, tempo.periodFrames);
  // Trim beats outside the music span and weak leading/trailing beats.
  const beatFrames = rawBeats.filter((f) => f >= startF - tempo.periodFrames * 0.25 && f <= endF);
  const beatTimes = beatFrames.map((f) => f * FRAME_MS);

  // Per-beat descriptors
  const halfP = Math.round(tempo.periodFrames / 2);
  const beatInfo = beatFrames.map((f, i) => {
    const a = Math.max(0, f - 3);
    const b = Math.min(n, f + 4);
    let on = 0;
    let lowOn = 0;
    for (let k = a; k < b; k++) { on = Math.max(on, ose[k]); lowOn = Math.max(lowOn, sig.lowOnset[k]); }
    const next = i + 1 < beatFrames.length ? beatFrames[i + 1] : Math.min(n, f + 2 * halfP);
    return { t: beatTimes[i], onset: on, lowOnset: lowOn, loudness: mean(sig.loudness, f, Math.max(f + 1, next)) };
  });

  // Pulse clarity: how much stronger the onsets are on beats than between them.
  const onBeat = mean(beatInfo.map((b) => b.onset));
  const midBeat = mean(beatFrames.slice(0, -1).map((f, i) => {
    const m = Math.round((f + beatFrames[i + 1]) / 2);
    let v = 0;
    for (let k = m - 2; k <= m + 2; k++) if (k >= 0 && k < n) v = Math.max(v, ose[k]);
    return v;
  }));
  const pulseClarity = onBeat > 0 ? Math.max(0, Math.min(1, (onBeat - midBeat) / onBeat)) : 0;

  // ── Meter and downbeat phase ──
  const { meter, phase } = estimateMeter(beatInfo, sig);
  const beats = beatInfo.map((b, i) => {
    const pos = (i - phase + meter * 1000) % meter;
    return { ...b, beatInBar: pos, downbeat: pos === 0 };
  });

  // ── Bars ──
  const bars = buildBars(beats, sig, ose, meter, durationMs);

  // ── Sections ──
  const segments = segmentStructure(bars, sig, meter);

  // ── Onsets (peak picking) for accents and free-time music ──
  const onsets = pickOnsets(ose, sig, startF, endF);

  const musicStartMs = startF * FRAME_MS;
  const musicEndMs = Math.min(durationMs, (endF + 1) * FRAME_MS);
  const moments = findMoments(segments, bars, onsets, musicEndMs);

  return {
    source: useFeatures ? 'features' : 'waveform',
    resolutionMs: Math.round(sig.resolutionMs * 10) / 10,
    durationMs,
    musicStartMs,
    musicEndMs,
    tempo: {
      bpm: Math.round(tempo.bpm * 10) / 10,
      periodMs: tempo.periodFrames * FRAME_MS,
      clarity: Math.round(tempo.clarity * 100) / 100,
      pulseClarity: Math.round(pulseClarity * 100) / 100,
    },
    meter,
    beats,
    bars,
    segments,
    onsets,
    moments,
    _signals: { ose, loudness: sig.loudness, lowOnset: sig.lowOnset, highOnset: sig.highOnset, bands: sig.bands, local },
  };
}

function estimateMeter(beatInfo, sig) {
  // Accent per beat: kick-band onset + loudness change into the beat.
  const accent = beatInfo.map((b, i) => {
    const prev = i > 0 ? beatInfo[i - 1].loudness : b.loudness;
    return b.lowOnset + 0.5 * Math.max(0, b.loudness - prev);
  });
  const m = mean(accent);
  const s = std(accent) || 1;
  const z = accent.map((v) => (v - m) / s);
  let best = { meter: 4, phase: 0, score: -Infinity };
  for (const meter of [4, 3]) {
    for (let phase = 0; phase < meter; phase++) {
      const sel = z.filter((_, i) => (i - phase + meter * 1000) % meter === 0);
      // Prefer 4/4 unless 3/4 is clearly better.
      const score = mean(sel) - (meter === 3 ? 0.25 : 0);
      if (score > best.score) best = { meter, phase, score };
    }
  }
  return best;
}

function buildBars(beats, sig, ose, meter, durationMs) {
  const bars = [];
  let current = null;
  beats.forEach((b, i) => {
    if (b.downbeat || current === null) {
      if (current) bars.push(current);
      current = { index: bars.length, t0: b.t, beatIdx: [i] };
    } else {
      current.beatIdx.push(i);
    }
  });
  if (current) bars.push(current);
  bars.forEach((bar, k) => {
    const next = bars[k + 1];
    const lastBeat = beats[bar.beatIdx[bar.beatIdx.length - 1]];
    const period = bar.beatIdx.length > 1 ? (lastBeat.t - bar.t0) / (bar.beatIdx.length - 1) : 500;
    bar.t1 = next ? next.t0 : Math.min(durationMs, lastBeat.t + period);
    const f0 = Math.floor(bar.t0 / FRAME_MS);
    const f1 = Math.max(f0 + 1, Math.floor(bar.t1 / FRAME_MS));
    bar.loudness = mean(sig.loudness, f0, f1);
    bar.onsetDensity = mean(ose, f0, f1);
    bar.bands = sig.bands ? sig.bands.map((band) => mean(band, f0, f1)) : null;
    bar.highRatio = sig.bands ? mean(sig.highOnset, f0, f1) / (mean(sig.lowOnset, f0, f1) + 1e-3) : 1;
  });
  // Loudness rank 0..1 across bars = "level"
  const louds = bars.map((b) => b.loudness).sort((x, y) => x - y);
  bars.forEach((bar) => {
    let lo = 0;
    while (lo < louds.length && louds[lo] < bar.loudness) lo++;
    bar.level = louds.length > 1 ? lo / (louds.length - 1) : 0.5;
  });
  return bars;
}

// ── Structure segmentation: novelty on a bar self-similarity matrix ──

function barFeatureVectors(bars) {
  const raw = bars.map((b) => [
    b.loudness,
    b.onsetDensity * 4,
    ...(b.bands ? [b.bands[0] - b.loudness, b.bands[1] - b.loudness, b.bands[2] - b.loudness] : []),
  ]);
  const dims = raw[0]?.length || 0;
  const mu = Array.from({ length: dims }, (_, d) => mean(raw.map((r) => r[d])));
  const sd = Array.from({ length: dims }, (_, d) => std(raw.map((r) => r[d])) || 1);
  return raw.map((r) => r.map((v, d) => (v - mu[d]) / sd[d]));
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / Math.max(1, a.length));
}

function segmentStructure(bars, sig, meter) {
  const nb = bars.length;
  if (nb === 0) return [];
  const feats = barFeatureVectors(bars);
  // Context stacking: each bar described with its successor, so a boundary is
  // detected where the texture changes for more than a single bar.
  const ctx = feats.map((f, i) => [...f, ...(feats[i + 1] || f)]);
  const sim = (i, j) => Math.exp(-(dist(ctx[i], ctx[j]) ** 2));

  const K = 4; // half kernel, in bars
  const novelty = new Float64Array(nb);
  for (let i = 0; i < nb; i++) {
    let s = 0;
    for (let a = -K; a < K; a++) {
      for (let b = -K; b < K; b++) {
        const ia = i + a;
        const ib = i + b;
        if (ia < 0 || ib < 0 || ia >= nb || ib >= nb) continue;
        const sign = (a < 0) === (b < 0) ? 1 : -1;
        const w = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * (K / 2) ** 2));
        s += sign * w * sim(ia, ib);
      }
    }
    novelty[i] = Math.max(0, s);
  }

  // Phrase grid: most pop/EDM phrases are 4 bars (or 8). Choose the offset that
  // best explains the novelty peaks, then favour boundaries on that grid.
  let bestOffset = 0;
  let bestOffScore = -1;
  for (let off = 0; off < 4; off++) {
    let s = 0;
    for (let i = off; i < nb; i += 4) s += novelty[i];
    if (s > bestOffScore) { bestOffScore = s; bestOffset = off; }
  }
  const novMean = mean(novelty);
  const novStd = std(novelty);
  const minLen = 4;
  const candidates = [];
  for (let i = 1; i < nb - 1; i++) {
    const onGrid = (i - bestOffset) % 4 === 0;
    const isPeak = novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1];
    const v = novelty[i] * (onGrid ? 1.3 : 1);
    if (isPeak && v > novMean + 0.3 * novStd) candidates.push({ i, v });
  }
  // Greedy pick by strength with minimum spacing.
  candidates.sort((a, b) => b.v - a.v);
  const chosen = [];
  for (const c of candidates) {
    if (c.i < minLen || nb - c.i < minLen) continue;
    if (chosen.every((x) => Math.abs(x - c.i) >= minLen)) chosen.push(c.i);
  }
  chosen.sort((a, b) => a - b);

  // Split very long sections on the phrase grid so the show keeps evolving.
  const bounds = [0, ...chosen, nb];
  const finalBounds = [0];
  for (let k = 1; k < bounds.length; k++) {
    const a = bounds[k - 1];
    const b = bounds[k];
    const len = b - a;
    if (len > 24) {
      const parts = Math.round(len / 16);
      for (let p = 1; p < parts; p++) {
        let cut = a + Math.round((len * p) / parts);
        const snap = cut - ((cut - bestOffset) % 4 + 4) % 4;
        if (snap - a >= minLen && b - snap >= minLen) cut = snap;
        finalBounds.push(cut);
      }
    }
    finalBounds.push(b);
  }

  const segs = [];
  for (let k = 1; k < finalBounds.length; k++) {
    const a = finalBounds[k - 1];
    const b = finalBounds[k];
    if (b <= a) continue;
    const segBars = bars.slice(a, b);
    const loud = segBars.map((x) => x.loudness);
    const half = Math.max(1, Math.floor(segBars.length / 2));
    const trendDb = mean(loud, half) - mean(loud, 0, half);
    segs.push({
      id: segs.length,
      barStart: a,
      barEnd: b,
      t0: bars[a].t0,
      t1: bars[b - 1].t1,
      level: Math.round(mean(segBars.map((x) => x.level)) * 100) / 100,
      loudness: mean(loud),
      density: mean(segBars.map((x) => x.onsetDensity)),
      trend: trendDb > 2.5 ? 'rising' : trendDb < -2.5 ? 'falling' : 'steady',
      vector: meanVector(feats.slice(a, b)),
    });
  }

  // Repetition labels: segments with similar average texture share a letter.
  const labels = [];
  segs.forEach((s) => {
    let found = null;
    for (const l of labels) {
      if (dist(l.vector, s.vector) < 0.45) { found = l; break; }
    }
    if (!found) {
      found = { letter: String.fromCharCode(65 + Math.min(labels.length, 25)), vector: s.vector };
      labels.push(found);
    }
    s.label = found.letter;
  });

  // Rhythmic vs free (no clear pulse) per section.
  const densities = segs.map((s) => s.density);
  const dMax = Math.max(...densities, 1e-6);
  segs.forEach((s) => {
    s.relDensity = Math.round((s.density / dMax) * 100) / 100;
    delete s.vector;
  });
  return segs;
}

function meanVector(vectors) {
  const d = vectors[0]?.length || 0;
  return Array.from({ length: d }, (_, k) => mean(vectors.map((v) => v[k])));
}

function pickOnsets(ose, sig, startF, endF) {
  const thr = movingAverage(ose, Math.round(0.5 * FPS));
  const out = [];
  let last = -Infinity;
  for (let i = Math.max(1, startF); i < Math.min(ose.length - 1, endF + 1); i++) {
    if (ose[i] < ose[i - 1] || ose[i] < ose[i + 1]) continue;
    if (ose[i] < thr[i] + 1.0 || ose[i] < 1.0) continue;
    if (i - last < 8) continue; // 80 ms min between onsets
    last = i;
    const low = sig.lowOnset[i];
    const high = sig.highOnset[i];
    out.push({ t: i * FRAME_MS, strength: Math.round(ose[i] * 100) / 100, band: low >= high ? 'low' : 'high' });
  }
  return out;
}

function findMoments(segments, bars, onsets, musicEndMs) {
  const moments = [];
  for (let k = 1; k < segments.length; k++) {
    const prev = segments[k - 1];
    const cur = segments[k];
    if (cur.level - prev.level >= 0.25 && cur.level >= 0.6) {
      moments.push({ type: 'impact', t: cur.t0, segment: cur.id });
    }
    if (cur.level <= 0.3 && prev.level >= 0.55 && segments[k + 1] && segments[k + 1].level >= 0.55) {
      moments.push({ type: 'break', t: cur.t0, segment: cur.id });
    }
  }
  // Ending: last strong onset near the end of the music.
  const tail = onsets.filter((o) => o.t > musicEndMs - 6000);
  if (tail.length) {
    const strongest = tail.reduce((a, b) => (b.strength > a.strength ? b : a));
    moments.push({ type: 'ending', t: strongest.t, segment: segments.length ? segments[segments.length - 1].id : 0 });
  }
  return moments;
}

module.exports = { analyzeMusic, isValidFeatures, FRAME_MS, gaussianSmooth, movingAverage, mean, std, percentile };
