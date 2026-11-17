/**
 * Objective metrics for a generated light show, computed the way the car sees it.
 *
 * Events are compiled like src/fseqExport.js does (20 ms frames, easing, power),
 * then thresholded like the car (> 50% = on). Metrics compare the light
 * "attacks" (off → on transitions) with reference beats and onsets computed
 * by librosa (independent from our own analysis).
 */

const STEP = 20;
const TOL = 60; // ms
const LIBROSA_LAG = 25; // librosa beats/onsets are ~25 ms late (measured on a synthetic click track)

const NON_LIGHT = /^(retro_|window_|trunk|flap|interior_)/;

function intensity(e, t) {
  if (t < e.startMs || t >= e.endMs) return 0;
  let v = (e.power ?? 100) / 100;
  const dur = e.endMs - e.startMs;
  const ease = Math.min(dur * 0.3, 1500);
  const el = t - e.startMs;
  const rem = e.endMs - t;
  if (e.easeIn && el < ease && ease > 0) v *= el / ease;
  if (e.easeOut && rem < ease && ease > 0) v *= rem / ease;
  if (e.effect === 'blink') {
    const periods = [80, 50, 30];
    const p = periods[e.blinkSpeed ?? 0] ?? 80;
    if (Math.floor(el / (p / 2)) % 2 !== 0) return 0;
  }
  if (e.effect === 'pulse') {
    const periods = [1200, 700, 400];
    const p = periods[e.pulseSpeed ?? 0] ?? 1200;
    v *= 0.5 - 0.5 * Math.cos((el / p) * Math.PI * 2);
  }
  return v;
}

// part → Uint8Array of on/off per frame
function compileOnOff(events, durationMs) {
  const frames = Math.ceil(durationMs / STEP);
  const parts = new Map();
  for (const e of events) {
    if (NON_LIGHT.test(e.part)) continue;
    if (!parts.has(e.part)) parts.set(e.part, new Float32Array(frames));
    const arr = parts.get(e.part);
    const f0 = Math.max(0, Math.floor(e.startMs / STEP));
    const f1 = Math.min(frames, Math.ceil(e.endMs / STEP));
    for (let f = f0; f < f1; f++) {
      const v = intensity(e, f * STEP);
      if (v > arr[f]) arr[f] = v;
    }
  }
  const onoff = new Map();
  for (const [p, arr] of parts) onoff.set(p, Uint8Array.from(arr, (v) => (v > 0.5 ? 1 : 0)));
  return { onoff, frames };
}

function nearestDist(sorted, t) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1; else hi = mid;
  }
  let d = Infinity;
  for (const k of [lo - 1, lo, lo + 1]) if (k >= 0 && k < sorted.length) d = Math.min(d, Math.abs(sorted[k] - t));
  return d;
}

function spearman(a, b) {
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(arr.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  if (n < 3) return 0;
  const ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - ma);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - ma) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * @param {object[]} events - show events (app format)
 * @param {object} ref - { beats: ms[], onsets: ms[] } from librosa
 * @param {object} analysis - our analysis (used for bars/levels/music span)
 */
function scoreShow(events, ref, analysis) {
  const durationMs = analysis.durationMs;
  const { onoff, frames } = compileOnOff(events, durationMs);
  const beats = ref.beats.map((t) => t - LIBROSA_LAG);
  const onsets = ref.onsets.map((t) => t - LIBROSA_LAG);
  const eighths = [];
  for (let i = 0; i < beats.length; i++) {
    eighths.push(beats[i]);
    if (i + 1 < beats.length) eighths.push((beats[i] + beats[i + 1]) / 2);
  }
  const grid = [...eighths, ...onsets].sort((a, b) => a - b);

  // Attack times (dedup per frame across parts) + violations per part.
  const attackFrames = new Set();
  let shortOn = 0;
  let shortOff = 0;
  let runs = 0;
  for (const arr of onoff.values()) {
    let runStart = -1;
    let lastOff = -1;
    for (let f = 0; f < frames; f++) {
      const on = arr[f] === 1;
      const prev = f > 0 && arr[f - 1] === 1;
      if (on && !prev) {
        attackFrames.add(f);
        if (lastOff >= 0 && (f - lastOff) * STEP < 100) shortOff++;
        runStart = f;
      }
      if (!on && prev) {
        runs++;
        if ((f - runStart) * STEP < 100) shortOn++;
        lastOff = f;
      }
    }
  }
  const attacks = [...attackFrames].sort((a, b) => a - b).map((f) => f * STEP);
  const inSync = (list, shift = 0) => {
    if (!list.length) return 0;
    return list.filter((t) => nearestDist(grid, t + shift) <= TOL).length / list.length;
  };
  const onBeatOrEighth = attacks.length ? attacks.filter((t) => nearestDist(eighths, t) <= TOL).length / attacks.length : 0;

  // Beats covered in non-calm sections.
  const active = analysis.segments.filter((s) => s.level >= 0.3);
  const activeBeats = beats.filter((t) => active.some((s) => t >= s.t0 && t < s.t1));
  const beatHit = activeBeats.length ? activeBeats.filter((t) => nearestDist(attacks, t) <= TOL).length / activeBeats.length : 0;

  // Darkness during the music.
  const f0 = Math.floor(analysis.musicStartMs / STEP);
  const f1 = Math.floor(analysis.musicEndMs / STEP);
  let dark = 0;
  let longestDark = 0;
  let curDark = 0;
  for (let f = f0; f < f1; f++) {
    let any = false;
    for (const arr of onoff.values()) if (arr[f]) { any = true; break; }
    if (!any) { dark++; curDark++; longestDark = Math.max(longestDark, curDark); } else curDark = 0;
  }

  // Energy correlation per bar: (attacks x lit parts) vs loudness.
  const activity = analysis.bars.map((bar) => {
    const a = Math.floor(bar.t0 / STEP);
    const b = Math.max(a + 1, Math.floor(bar.t1 / STEP));
    let lit = 0;
    for (const arr of onoff.values()) for (let f = a; f < b; f++) lit += arr[f];
    const nAtt = attacks.filter((t) => t >= bar.t0 && t < bar.t1).length;
    return nAtt * 2 + lit / (b - a);
  });
  const energyCorr = spearman(activity, analysis.bars.map((b) => b.loudness));

  // ── Big moments (librosa loudness jumps): does the car answer with a massive, sharp attack? ──
  const nParts = Math.max(1, onoff.size);
  const attackCount = new Uint16Array(frames);
  const litFrac = new Float32Array(frames);
  for (const arr of onoff.values()) {
    for (let f = 0; f < frames; f++) {
      litFrac[f] += arr[f] / nParts;
      if (arr[f] && (f === 0 || !arr[f - 1])) attackCount[f]++;
    }
  }
  const fr = (t) => Math.max(0, Math.min(frames - 1, Math.round(t / STEP)));
  const refMoments = (ref.moments || []).map((m) => m.t - LIBROSA_LAG);
  let momentHits = 0;
  let impactSum = 0;
  for (const t of refMoments) {
    let after = 0;
    for (let f = fr(t - 40); f <= fr(t + 250); f++) after = Math.max(after, litFrac[f]);
    let before = 0;
    let nb = 0;
    for (let f = fr(t - 1000); f < fr(t - 150); f++) { before += litFrac[f]; nb++; }
    before = nb ? before / nb : 0;
    let attacked = 0;
    for (let f = fr(t - 80); f <= fr(t + 80); f++) attacked += attackCount[f];
    const impact = after - before;
    impactSum += impact;
    if (attacked >= Math.ceil(nParts * 0.4) && after >= 0.6 && impact >= 0.25) momentHits++;
  }

  // ── Groove fidelity: per section, rhythm of the lights vs rhythm of the music on the 16th grid ──
  let grooveSum = 0;
  let grooveW = 0;
  for (const seg of analysis.segments) {
    const bars = analysis.bars.filter((b) => b.t0 >= seg.t0 - 1 && b.t0 < seg.t1 - 1 && b.beatIdx.length === analysis.meter);
    if (bars.length < 4) continue;
    const S = analysis.meter * 4;
    const audio = new Float64Array(S);
    const light = new Float64Array(S);
    for (const bar of bars) {
      bar.beatIdx.forEach((bi, k) => {
        const t = analysis.beats[bi].t;
        const next = analysis.beats[bi + 1] ? analysis.beats[bi + 1].t : t + analysis.tempo.periodMs;
        for (let j = 0; j < 4; j++) {
          const ts = t + ((next - t) * j) / 4;
          if (nearestDist(onsets, ts) <= 40) audio[k * 4 + j] += 1;
          let c = 0;
          for (let f = fr(ts - 40); f <= fr(ts + 40); f++) c += attackCount[f];
          light[k * 4 + j] += c;
        }
      });
    }
    let dot = 0, na = 0, nl = 0;
    for (let k = 0; k < S; k++) { dot += audio[k] * light[k]; na += audio[k] ** 2; nl += light[k] ** 2; }
    if (na && nl) { grooveSum += (dot / Math.sqrt(na * nl)) * bars.length; grooveW += bars.length; }
  }

  const lastAttack = attacks.length ? attacks[attacks.length - 1] : 0;
  const lights = events.filter((e) => !NON_LIGHT.test(e.part));
  return {
    events: events.length,
    attacksPerSec: +(attacks.length / ((analysis.musicEndMs - analysis.musicStartMs) / 1000)).toFixed(2),
    inSync: +inSync(attacks).toFixed(2),
    // Same score for attacks shifted by random-ish offsets: what a show unrelated to the music would get.
    chance: +([70, 110, 150, 190, 230, 270, 310, 350, 390, 430].reduce((acc, sh) => acc + inSync(attacks, sh), 0) / 10).toFixed(2),
    onGrid: +onBeatOrEighth.toFixed(2),
    beatHit: +beatHit.toFixed(2),
    darkPct: +((dark / Math.max(1, f1 - f0)) * 100).toFixed(1),
    longestDarkS: +((longestDark * STEP) / 1000).toFixed(1),
    energyCorr: +energyCorr.toFixed(2),
    shortOn: runs ? +((shortOn / runs) * 100).toFixed(1) : 0,
    shortOff: runs ? +((shortOff / runs) * 100).toFixed(1) : 0,
    blinkEvents: lights.filter((e) => e.effect === 'blink').length,
    endGapS: +((analysis.musicEndMs - lastAttack) / 1000).toFixed(1),
    // null when the track has no big moment
    momentHit: refMoments.length ? +(momentHits / refMoments.length).toFixed(2) : null,
    momentImpact: refMoments.length ? +(impactSum / refMoments.length).toFixed(2) : null,
    grooveFid: grooveW ? +(grooveSum / grooveW).toFixed(2) : null,
  };
}

const { MOTIF_ENERGY } = require('../src/services/showEngine/motifs');

/**
 * Plan quality (deterministic):
 *  eMatch   — Spearman(motif energy, section level): does the light energy follow the music?
 *  coher    — share of repeated sections (same label) that reuse the label's main motif
 *  contrast — share of label changes between adjacent sections that also change motif
 *  buildOk  — share of big energy jumps (impact moments) prepared by a build or marked by an impact
 */
function planMetrics(plan, analysis) {
  const segs = analysis.segments;
  const byId = new Map(plan.sections.map((s) => [s.id, s]));
  const motifOf = (seg) => byId.get(seg.id)?.motif;
  const eMatch = spearman(segs.map((s) => MOTIF_ENERGY[motifOf(s)] ?? 1 + Math.random() * 0.01), segs.map((s) => s.level));
  const labels = new Map();
  segs.forEach((s) => { if (!labels.has(s.label)) labels.set(s.label, []); labels.get(s.label).push(motifOf(s)); });
  let rep = 0, same = 0;
  for (const motifs of labels.values()) {
    if (motifs.length < 2) continue;
    const counts = {};
    motifs.forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
    rep += motifs.length;
    same += Math.max(...Object.values(counts));
  }
  let changes = 0, diff = 0;
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].label !== segs[i - 1].label) { changes++; if (motifOf(segs[i]) !== motifOf(segs[i - 1])) diff++; }
  }
  const impacts = analysis.moments.filter((m) => m.type === 'impact');
  const prepared = impacts.filter((m) => byId.get(m.segment)?.impact || byId.get(m.segment - 1)?.build).length;
  return {
    eMatch: +eMatch.toFixed(2),
    coher: rep ? +(same / rep).toFixed(2) : 1,
    contrast: changes ? +(diff / changes).toFixed(2) : 1,
    buildOk: impacts.length ? +(prepared / impacts.length).toFixed(2) : 1,
  };
}

module.exports = { scoreShow, compileOnOff, planMetrics };
