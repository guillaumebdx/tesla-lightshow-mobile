/**
 * Song-specific highlights and grooves, computed from the analysis signals.
 *
 * Highlights are the moments an audience remembers — the light show answers
 * them with dedicated effects (renderer.js):
 *   drop   — the music explodes after a quieter stretch (big loudness jump on a beat)
 *   stop   — sudden near-silence inside the music, then the music comes back
 *   hit    — an isolated attack far stronger than its surroundings (orchestral stab, crash)
 *   riser  — energy climbing for several bars into a drop
 *   climax — the loudest 8 bars of the song
 *
 * Grooves are the rhythmic signature of each section: average attack strength on
 * each 16th-note slot of the bar, split by band (low = kick/bass, mid = snare/voice,
 * high = hats/cymbals). Motifs "groove" and "drumkit" play them back on the car.
 */

const { FRAME_MS, gaussianSmooth, movingAverage, mean, percentile } = require('./analysis');

const frameOf = (t) => Math.round(t / FRAME_MS);

function maxAround(arr, f, radius) {
  let v = 0;
  for (let k = Math.max(0, f - radius); k <= Math.min(arr.length - 1, f + radius); k++) if (arr[k] > v) v = arr[k];
  return v;
}

// Mid-band (snare / voice) attack strength from the mid band energy (dB).
function midOnset(sig) {
  if (!sig.bands) return null;
  const b = sig.bands[1];
  const out = new Float64Array(b.length);
  for (let i = 2; i < b.length; i++) out[i] = Math.max(0, b[i] - Math.max(b[i - 1], b[i - 2]));
  return out;
}

function detectDrops(analysis, loud) {
  const beats = analysis.beats;
  const L = beats.map((b) => b.loudness);
  const p50 = percentile(L, 0.5);
  const cands = [];
  for (let i = 4; i < beats.length - 1; i++) {
    const pre = mean(L.slice(i - 4, i));
    // The return beat itself counts (jagged music: the beat after can already be softer).
    const post = Math.max(L[i], mean(L.slice(i, i + 2)));
    // A louder section starts (vs the last 4 or 2 beats), or the music comes back after a short dip.
    const dip = Math.min(L[i - 1], L[i - 2]);
    const jump = Math.max(post - pre, post - mean(L.slice(i - 2, i)), 0.8 * (post - dip));
    if (jump < 4.5 || post < p50) continue;
    cands.push({ i, t: beats[i].t, jump, score: jump + 0.5 * Math.min(4, beats[i].onset) });
  }
  // Non-maximum suppression over ±4 beats (an explosion lasts one bar).
  cands.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const c of cands) if (kept.every((k) => Math.abs(k.i - c.i) >= 4)) kept.push(c);
  // Big jumps are always kept; smaller ones only up to ~1 per 25 s.
  const big = kept.filter((c) => c.jump >= 8).slice(0, 12);
  const maxSmall = Math.max(2, Math.round((analysis.musicEndMs - analysis.musicStartMs) / 25000));
  const small = kept.filter((c) => c.jump < 8).slice(0, maxSmall);
  return big.concat(small).sort((a, b) => a.t - b.t).map((c) => ({ type: 'drop', t: snapToAttack(analysis, c.t, c.i), beat: c.i, strength: +c.jump.toFixed(1) }));
}

/**
 * The music often comes back slightly before the beat (a pickup, a crash on the "and").
 * Move a moment to the strongest attack in [beat - 0.4 beat, beat + 0.15 beat] when that
 * attack is clearly stronger than the one on the beat.
 */
function snapToAttack(analysis, t, beatIdx) {
  const p = analysis.tempo.periodMs;
  const near = analysis.onsets.filter((o) => o.t >= t - 0.4 * p && o.t <= t + 0.15 * p);
  if (!near.length) return t;
  const best = near.reduce((a, b) => (b.strength > a.strength ? b : a));
  const onBeat = beatIdx !== undefined ? analysis.beats[beatIdx].onset : 0;
  return best.strength >= 1.5 * onBeat || Math.abs(best.t - t) <= 30 ? best.t : t;
}

// Where the music really arrives: the first attack once the level reaches the song's body.
function detectIntro(analysis, loud) {
  const beats = analysis.beats;
  if (!beats.length) return null;
  const med = percentile(beats.map((b) => b.loudness), 0.5);
  const first = beats.find((b) => b.loudness >= med - 4);
  if (!first || first.t > analysis.musicStartMs + 15000) return null;
  const near = analysis.onsets.filter((o) => o.t >= first.t - 400 && o.t <= first.t + 200);
  const t = near.length ? near.reduce((a, b) => (b.strength > a.strength ? b : a)).t : first.t;
  return { type: 'intro', t };
}

function detectStops(analysis, loud) {
  const n = loud.length;
  // Reference = level of the 2 s BEFORE each frame (a dip must not lower its own reference).
  const avg = movingAverage(loud, 100);
  const before = (f) => avg[Math.max(0, f - 100)];
  const f0 = frameOf(analysis.musicStartMs) + 200;
  const f1 = frameOf(analysis.musicEndMs) - 100;
  const stops = [];
  let runStart = -1;
  let refAtStart = 0;
  for (let f = f0; f < f1; f++) {
    const quiet = loud[f] < (runStart >= 0 ? refAtStart : before(f)) - 12;
    if (quiet && runStart < 0) { runStart = f; refAtStart = before(f); }
    if (!quiet && runStart >= 0) {
      const len = f - runStart;
      // Music must come back strongly right after.
      const back = mean(loud, f, Math.min(n, f + 30));
      if (len >= 25 && len <= 300 && back >= refAtStart - 4) {
        // The return is the strongest attack just after the level comes back.
        const tBack = f * FRAME_MS;
        const ret = analysis.onsets.filter((o) => o.t >= tBack - 100 && o.t <= tBack + 500);
        const t1 = ret.length ? ret.reduce((a, b) => (b.strength > a.strength ? b : a)).t : tBack;
        stops.push({ type: 'stop', t: runStart * FRAME_MS, t1, strength: +(refAtStart - mean(loud, runStart, f)).toFixed(1) });
      }
      runStart = -1;
    }
  }
  return stops;
}

function detectHits(analysis, drops) {
  const on = analysis.onsets;
  const period = analysis.tempo.periodMs;
  const hits = [];
  on.forEach((o) => {
    const ctx = on.filter((x) => Math.abs(x.t - o.t) <= 3000 && x !== o).map((x) => x.strength);
    const med = ctx.length ? percentile(ctx, 0.5) : 1;
    const ratio = o.strength / Math.max(0.5, med);
    if (o.strength >= 3.5 && ratio >= 2.5 && drops.every((d) => Math.abs(d.t - o.t) > period)) hits.push({ type: 'hit', t: o.t, strength: +ratio.toFixed(1) });
  });
  // At most one hit per 4 bars, strongest first.
  const minGap = period * analysis.meter * 4;
  hits.sort((a, b) => b.strength - a.strength);
  const kept = [];
  for (const h of hits) if (kept.every((k) => Math.abs(k.t - h.t) >= minGap)) kept.push(h);
  return kept.slice(0, 8).sort((a, b) => a.t - b.t);
}

function detectRisers(analysis, drops) {
  const bars = analysis.bars;
  const risers = [];
  for (const d of drops) {
    const k = bars.findIndex((b) => b.t0 >= d.t - 1);
    if (k < 3) continue;
    // Walk back while each bar is louder than the one before it.
    let start = k - 1;
    while (start > 0 && bars[start].loudness > bars[start - 1].loudness + 0.3 && k - start < 8) start--;
    const rise = bars[k - 1].loudness - bars[start].loudness;
    // A real crescendo: at least 3 bars climbing, not just the recovery after a dip.
    if (k - start >= 3 && rise >= 4) risers.push({ type: 'riser', t: bars[start].t0, t1: d.t, bars: k - start, strength: +rise.toFixed(1) });
  }
  return risers;
}

function detectClimax(analysis) {
  const bars = analysis.bars;
  if (bars.length < 8) return null;
  let best = -Infinity;
  let at = 0;
  for (let k = 0; k + 8 <= bars.length; k++) {
    const v = mean(bars.slice(k, k + 8).map((b) => b.loudness));
    if (v > best) { best = v; at = k; }
  }
  return { type: 'climax', t: bars[at].t0, t1: bars[at + 7].t1 };
}

/**
 * Groove of one section: per 16th slot of the bar, mean attack strength
 * (overall and per band), normalised to the strongest slot.
 */
function sectionGroove(analysis, seg, sig, mid) {
  const slotsPerBeat = 4;
  const nSlots = analysis.meter * slotsPerBeat;
  const all = new Float64Array(nSlots);
  const low = new Float64Array(nSlots);
  const midA = new Float64Array(nSlots);
  const high = new Float64Array(nSlots);
  let barsUsed = 0;
  const beats = analysis.beats;
  const bars = analysis.bars.filter((b) => b.t0 >= seg.t0 - 1 && b.t0 < seg.t1 - 1 && b.beatIdx.length === analysis.meter);
  for (const bar of bars) {
    barsUsed++;
    bar.beatIdx.forEach((bi, beatInBar) => {
      const t = beats[bi].t;
      const next = bi + 1 < beats.length ? beats[bi + 1].t : t + analysis.tempo.periodMs;
      for (let k = 0; k < slotsPerBeat; k++) {
        const f = frameOf(t + ((next - t) * k) / slotsPerBeat);
        const s = beatInBar * slotsPerBeat + k;
        all[s] += maxAround(sig.ose, f, 2);
        low[s] += maxAround(sig.lowOnset, f, 2);
        high[s] += maxAround(sig.highOnset, f, 2);
        if (mid) midA[s] += maxAround(mid, f, 2);
      }
    });
  }
  if (!barsUsed) return null;
  const norm = (a) => { const m = Math.max(...a, 1e-9); return Array.from(a, (v) => +(v / m).toFixed(2)); };
  const overall = norm(all);
  // How repetitive is the rhythm? (mean over slots of normalised strength; low = sparse, clear pattern)
  return {
    slots: nSlots,
    all: overall,
    low: norm(low),
    mid: mid ? norm(midA) : null,
    high: norm(high),
    bars: barsUsed,
    // false on the legacy waveform path: low/high are the same signal, no instrument split
    hasBands: !!sig.bands,
    // Slots carrying the groove, strongest first (for prompts and logs).
    accents: overall.map((v, s) => [s, v]).filter(([, v]) => v >= 0.6).sort((a, b) => b[1] - a[1]).map(([s]) => s),
  };
}

function grooveText(g, meter) {
  if (!g) return '';
  // e.g. "X..x..X.x.X..x.." (X strong, x medium, . weak), one char per 16th.
  return g.all.map((v, s) => (v >= 0.75 ? 'X' : v >= 0.5 ? 'x' : '.') + ((s + 1) % (meter * 4) === 0 ? '' : (s + 1) % 4 === 0 ? '|' : '')).join('');
}

function findHighlights(analysis) {
  const sig = analysis._signals;
  const loud = gaussianSmooth(sig.loudness, 3);
  const drops = detectDrops(analysis, loud);
  const stops = detectStops(analysis, loud);
  // A stop followed by a drop: the drop is the "return" — keep both, flag it.
  for (const s of stops) {
    const d = drops.find((x) => Math.abs(x.t - s.t1) < analysis.tempo.periodMs * 1.5);
    if (d) d.afterStop = true;
  }
  const intro = detectIntro(analysis, loud);
  const hits = detectHits(analysis, drops).filter((x) => !intro || Math.abs(x.t - intro.t) > 2000 && x.t > intro.t);
  const risers = detectRisers(analysis, drops);
  const climax = detectClimax(analysis);
  const mid = midOnset(sig);
  const grooves = new Map(analysis.segments.map((seg) => [seg.id, sectionGroove(analysis, seg, sig, mid)]));
  return { intro, drops, stops, hits, risers, climax, grooves };
}

/**
 * One list of moments for the designer and the renderer, in time order, with ids.
 * Default effect: explosion for big drops (or drops after a stop), flash otherwise;
 * a stop not followed by a drop gets blackout + flash on the return.
 */
function listMoments(h) {
  const list = [];
  if (h.intro && h.drops.every((d) => Math.abs(d.t - h.intro.t) > 1500)) list.push({ type: 'intro', t: h.intro.t, fx: 'explosion' });
  h.drops.forEach((d) => list.push({ type: 'drop', t: d.t, strength: d.strength, afterStop: !!d.afterStop, fx: d.strength >= 8 || d.afterStop ? 'explosion' : 'flash' }));
  h.stops.forEach((s) => {
    const followed = h.drops.some((d) => d.t >= s.t1 - 400 && d.t - s.t1 < 1500);
    if (!followed) list.push({ type: 'stop', t: s.t, t1: s.t1, strength: s.strength, fx: 'blackout_flash' });
  });
  h.hits.forEach((x) => list.push({ type: 'hit', t: x.t, strength: x.strength, fx: 'flash' }));
  list.sort((a, b) => a.t - b.t);
  // Too many explosions kill the effect: keep at most one per 12 s (strongest wins),
  // the others become flashes.
  const explosions = list.filter((m) => m.fx === 'explosion').sort((a, b) => (b.type === 'intro') - (a.type === 'intro') || (b.strength || 0) - (a.strength || 0));
  const keptEx = [];
  for (const m of explosions) {
    if (keptEx.every((k) => Math.abs(k.t - m.t) >= 12000)) keptEx.push(m);
    else m.fx = 'flash';
  }
  list.forEach((m, i) => { m.id = i; });
  return list;
}

module.exports = { findHighlights, grooveText, listMoments };
