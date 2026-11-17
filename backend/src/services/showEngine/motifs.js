/**
 * Beat-locked light motifs.
 *
 * A motif turns a section of the beat grid into "hits": { role, side, t0, t1, ease? }.
 * Every hit starts on a beat, a subdivision of a beat or a detected onset — never
 * on an arbitrary time. Roles are abstract (head, sig, tail...) and mapped to
 * the car's real parts by carProfiles.js.
 *
 * Car constraints baked in: most lights are on/off (> 50% = on), need >= 100 ms
 * on and >= 100 ms off to read well, and blink effects are never used (they are
 * a fixed 30-80 ms flicker unrelated to the music).
 */

const MIN_ON = 100;
const MIN_GAP = 100;

// ─── Role groups ───
const G = {
  front: ['head', 'sig'],
  main: ['head', 'sig', 'tail'],
  rear: ['tail', 'rearBar'],
  all: ['head', 'sig', 'tail', 'blinkF', 'blinkR', 'side', 'brake', 'plate', 'rearBar', 'reverse'],
  accents: ['brake', 'plate', 'reverse'],
  blinkers: ['blinkF', 'blinkR'],
};

// Positions around the car for chases (clockwise seen from above, starting front-left).
const CIRCLE = [
  [['head', 'L'], ['sig', 'L'], ['blinkF', 'L']],
  [['head', 'R'], ['sig', 'R'], ['blinkF', 'R']],
  [['side', 'R']],
  [['tail', 'R'], ['blinkR', 'R']],
  [['tail', 'L'], ['blinkR', 'L']],
  [['side', 'L']],
];

// Front → back layers for waves.
const WAVE = [
  [['head', 'both'], ['sig', 'both']],
  [['blinkF', 'both']],
  [['side', 'both']],
  [['tail', 'both'], ['blinkR', 'both'], ['rearBar', 'both']],
  [['brake', 'both'], ['plate', 'both'], ['reverse', 'both']],
];

// ─── Helpers ───

function hitsFor(roles, side, t0, t1, extra = {}) {
  return roles.map((role) => ({ role, side, t0, t1, ...extra }));
}

// Length of a hit given the time until the next hit on the same parts.
function len(interval, style = 'staccato') {
  const frac = style === 'legato' ? 0.85 : style === 'short' ? 0.3 : 0.5;
  return Math.max(MIN_ON, Math.min(interval * frac, interval - MIN_GAP));
}

/**
 * Grid access for one section.
 * beats: global beat list [{ t, beatInBar, downbeat }]; [b0, b1) = section beat range.
 */
function makeGrid(analysis, seg) {
  const all = analysis.beats;
  const idx = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].t >= seg.t0 - 1 && all[i].t < seg.t1 - 1) idx.push(i);
  }
  const period = analysis.tempo.periodMs;
  const beatEnd = (i) => (i + 1 < all.length ? all[i + 1].t : all[i].t + period);
  return {
    period,
    meter: analysis.meter,
    beats: idx.map((i) => ({ ...all[i], i, end: Math.min(beatEnd(i), seg.t1) })),
    // k-th of n equal subdivisions of global beat i (extrapolated past the last beat)
    sub: (i, k, n) => {
      if (i >= all.length) return all[all.length - 1].t + (i - all.length + 1 + k / n) * period;
      return all[i].t + ((beatEnd(i) - all[i].t) * k) / n;
    },
    onsets: analysis.onsets.filter((o) => o.t >= seg.t0 && o.t < seg.t1),
    t0: seg.t0,
    t1: seg.t1,
    // Song-specific rhythm of this section (highlights.js) and raw signals.
    groove: analysis.highlights ? analysis.highlights.grooves.get(seg.id) : null,
    signals: analysis._signals,
  };
}

// Attack strength of a signal around time t (10 ms frames, ±20 ms).
function attackAt(arr, t) {
  if (!arr) return 0;
  const f = Math.round(t / 10);
  let v = 0;
  for (let k = Math.max(0, f - 2); k <= Math.min(arr.length - 1, f + 2); k++) if (arr[k] > v) v = arr[k];
  return v;
}

// Light group for an instrument band: kick/bass at the rear, snare/voice on the
// headlights, hats/cymbals on the blinkers and repeaters.
const BAND_ROLES = {
  low: ['tail', 'brake', 'rearBar'],
  mid: ['head', 'sig'],
  high: ['blinkF', 'blinkR', 'side'],
};

function dominantBand(low, mid, high) {
  if (mid === null || mid === undefined) return low >= high ? 'low' : 'high';
  if (low >= mid && low >= high) return 'low';
  return mid >= high ? 'mid' : 'high';
}

// Phrase index (4 bars) of a beat inside the section, used for automatic variation.
function phraseOf(grid, beat) {
  let bars = 0;
  for (const b of grid.beats) {
    if (b.t >= beat.t) break;
    if (b.downbeat) bars++;
  }
  return Math.floor(bars / 4);
}

/**
 * Strong onsets of the section, snapped to the nearest 16th note when close
 * to the grid (keeps "free" attacks when the music really is off-grid).
 */
function strongOnsets(grid, minSpacing) {
  if (!grid.onsets.length) return [];
  const strengths = grid.onsets.map((o) => o.strength).sort((a, b) => a - b);
  const thr = Math.max(2, strengths[Math.floor(strengths.length * 0.5)]);
  const ticks = [];
  grid.beats.forEach((b) => { for (let k = 0; k < 4; k++) ticks.push(grid.sub(b.i, k, 4)); });
  const out = [];
  for (const o of grid.onsets) {
    if (o.strength < thr) continue;
    let t = o.t;
    let best = Infinity;
    for (const tick of ticks) {
      const d = Math.abs(tick - o.t);
      if (d < best) { best = d; t = tick; }
    }
    if (best > 70) t = o.t;
    const prev = out[out.length - 1];
    if (prev && t - prev.t < minSpacing) {
      if (o.strength > prev.strength) { prev.t = t; prev.strength = o.strength; prev.band = o.band; }
      continue;
    }
    out.push({ ...o, t });
  }
  return out;
}

// Choose a subdivision count so each step is at least `minStep` ms.
function subdivFor(period, wanted, minStep) {
  let n = wanted;
  while (n > 1 && period / n < minStep) n /= 2;
  return Math.max(1, Math.round(n));
}

// ═══════════════════════════════════════════════════════════════
// MOTIFS — calm
// ═══════════════════════════════════════════════════════════════

const MOTIFS = {
  // Signatures and tails trade places every bar, held legato. Very calm.
  breathe(grid) {
    const out = [];
    const downs = grid.beats.filter((b) => b.downbeat);
    downs.forEach((b, k) => {
      const next = downs[k + 1] ? downs[k + 1].t : grid.t1;
      const t1 = b.t + len(next - b.t, 'legato');
      const roles = k % 2 === 0 ? ['sig'] : ['tail', 'rearBar'];
      out.push(...hitsFor(roles, 'both', b.t, t1));
    });
    return out;
  },

  // Steady signatures + tails, headlights touch every downbeat.
  glow(grid) {
    const out = hitsFor(['sig', 'tail'], 'both', grid.t0, grid.t1 - MIN_GAP);
    const downs = grid.beats.filter((b) => b.downbeat);
    downs.forEach((b) => out.push(...hitsFor(['head'], 'both', b.t, b.t + len(grid.period, 'staccato'))));
    return out;
  },

  // Follows the music's attacks with soft parts only (good for piano, ballads).
  onsets_soft(grid) {
    const out = [];
    const strong = strongOnsets(grid, 250);
    strong.forEach((o, k) => {
      const next = strong[k + 1] ? strong[k + 1].t : o.t + grid.period;
      const t1 = o.t + len(Math.min(next - o.t, grid.period * 2), 'legato');
      const side = k % 2 === 0 ? 'L' : 'R';
      out.push(...hitsFor(o.band === 'low' ? ['tail'] : ['sig'], side, o.t, t1));
    });
    return out;
  },

  // ═══════════════════════════════════════════════════════════════
  // MOTIFS — medium
  // ═══════════════════════════════════════════════════════════════

  // Main lights on every beat (on every other beat when the tempo is fast).
  pulse(grid) {
    const out = [];
    const step = grid.period < 400 ? 2 : 1;
    grid.beats.forEach((b, k) => {
      if (k % step !== 0) return;
      const roles = b.downbeat ? G.main : ['head', 'tail'];
      out.push(...hitsFor(roles, 'both', b.t, b.t + len(grid.period * step)));
    });
    return out;
  },

  // Left side on one beat, right side on the next.
  ping_pong(grid) {
    const out = [];
    grid.beats.forEach((b, k) => {
      const flip = phraseOf(grid, b) % 2;
      const side = (k + flip) % 2 === 0 ? 'L' : 'R';
      out.push(...hitsFor(['head', 'sig', 'tail', 'blinkF', 'blinkR'], side, b.t, b.t + len(grid.period * 2, 'staccato')));
    });
    return out;
  },

  // Kick / snare feel: front on strong beats, rear on the backbeats.
  front_back(grid) {
    const out = [];
    grid.beats.forEach((b) => {
      const strongBeat = b.beatInBar % 2 === 0;
      const roles = strongBeat ? ['head', 'sig', 'blinkF'] : ['tail', 'blinkR', 'brake', 'rearBar'];
      out.push(...hitsFor(roles, 'both', b.t, b.t + len(grid.period * 2, 'staccato')));
    });
    return out;
  },

  // Front → back sweep, one per bar, each step on an 8th note.
  wave(grid) {
    const out = [];
    const n = grid.period / 2 >= 110 ? 2 : 1;
    const stepsPerSweep = WAVE.length;
    const starts = grid.beats.filter((b) => b.downbeat);
    starts.forEach((b) => {
      const reverse = phraseOf(grid, b) % 2 === 1;
      const layers = reverse ? [...WAVE].reverse() : WAVE;
      // Grid times from this beat onwards.
      const times = [];
      for (let i = b.i; times.length < stepsPerSweep + 2 && i < b.i + 4; i++) {
        for (let k = 0; k < n && times.length < stepsPerSweep + 2; k++) times.push(grid.sub(i, k, n));
      }
      // Progressive fill: each layer joins on its 8th and stays until the bar ends.
      const nextDown = grid.beats.find((x) => x.downbeat && x.t > b.t);
      const barEnd = Math.min(nextDown ? nextDown.t : b.t + grid.period * grid.meter, grid.t1);
      layers.forEach((layer, j) => {
        if (j >= times.length) return;
        const t0 = times[j];
        const t1 = barEnd - MIN_GAP;
        if (t0 >= grid.t1 || t1 - t0 < MIN_ON) return;
        layer.forEach(([role, side]) => out.push({ role, side, t0, t1 }));
      });
    });
    return out;
  },

  // Attacks of the music on the whole car, low hits at the rear, high hits at the front.
  onsets(grid) {
    const out = [];
    const strong = strongOnsets(grid, 150);
    const bigThr = strong.length ? [...strong].sort((a, b) => b.strength - a.strength)[Math.floor(strong.length * 0.25)].strength : Infinity;
    strong.forEach((o, k) => {
      const next = strong[k + 1] ? strong[k + 1].t : o.t + grid.period;
      const t1 = o.t + len(Math.min(next - o.t, grid.period * 2), 'staccato');
      const big = o.strength >= bigThr;
      const roles = o.band === 'low' ? ['tail', 'brake', 'rearBar'] : ['head', 'sig'];
      out.push(...hitsFor(big ? G.main : roles, 'both', o.t, t1));
    });
    return out;
  },

  // The section's own rhythm: its strongest 16th-note slots (measured over all its
  // bars), each on the lights of the instrument that dominates that slot. A slot
  // only fires in a given bar if the music really plays it there (fills, breaks).
  groove(grid) {
    const g = grid.groove;
    if (!g) return MOTIFS.pulse(grid);
    const out = [];
    const slotsPerBeat = 4;
    const active = g.all.map((w, s) => ({ s, w, band: dominantBand(g.low[s], g.mid ? g.mid[s] : null, g.high[s]) })).filter((x) => x.w >= 0.5);
    if (active.length < 2) return MOTIFS.pulse(grid);
    const sigs = grid.signals;
    const downs = grid.beats.filter((b) => b.downbeat);
    // Pass 1: slot times and attack strength in every bar.
    const perBar = downs.map((d) => active.map((x) => {
      const t = grid.sub(d.i + Math.floor(x.s / slotsPerBeat), x.s % slotsPerBeat, slotsPerBeat);
      return { ...x, t, here: attackAt(sigs.ose, t) };
    }).filter((x) => x.t < grid.t1));
    const slotMean = {};
    active.forEach((x) => {
      const vals = perBar.flatMap((bar) => bar.filter((y) => y.s === x.s).map((y) => y.here));
      slotMean[x.s] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    // Pass 2: play a slot only where this bar really has an attack (≥ 30% of the slot's mean).
    perBar.forEach((bar, barNo) => {
      const times = bar.filter((x) => x.here >= 0.3 * slotMean[x.s]);
      const mirror = barNo % 2 === 1;
      times.forEach((x, j) => {
        const sameBand = times.slice(j + 1).find((y) => y.band === x.band);
        const nextT = sameBand ? sameBand.t : x.t + grid.period;
        // Legato: the lights hold until their next hit (with a dip before it), so the
        // groove reads as accents on a lit car rather than isolated blips.
        const t1 = x.t + len(nextT - x.t, 'legato');
        const roles = !g.hasBands ? G.main : x.w >= 0.85 ? [...new Set([...BAND_ROLES[x.band], 'head', 'tail'])] : BAND_ROLES[x.band];
        const side = x.band === 'high' ? ((j + (mirror ? 1 : 0)) % 2 === 0 ? 'L' : 'R') : 'both';
        out.push(...hitsFor(roles, side, x.t, t1));
      });
    });
    return out;
  },

  // A visual drum kit: every real attack, snapped to the 16th grid, on the lights
  // of its instrument (kick → rear, snare → headlights, hats → blinkers L/R).
  drumkit(grid) {
    const sigs = grid.signals;
    const strong = strongOnsets(grid, 110);
    if (!strong.length || !sigs.bands) return MOTIFS.onsets(grid);
    const mid = sigs.bands ? sigs.bands[1] : null;
    const lowMax = Math.max(...strong.map((o) => attackAt(sigs.lowOnset, o.t)), 1e-9);
    const highMax = Math.max(...strong.map((o) => attackAt(sigs.highOnset, o.t)), 1e-9);
    const midRise = (t) => {
      if (!mid) return null;
      const f = Math.round(t / 10);
      let v = 0;
      for (let k = Math.max(2, f - 2); k <= Math.min(mid.length - 1, f + 2); k++) v = Math.max(v, mid[k] - Math.max(mid[k - 1], mid[k - 2]));
      return v;
    };
    const midMax = mid ? Math.max(...strong.map((o) => midRise(o.t)), 1e-9) : 1;
    const out = [];
    let hat = 0;
    const lastByBand = {};
    const bands = strong.map((o) => dominantBand(attackAt(sigs.lowOnset, o.t) / lowMax, mid ? midRise(o.t) / midMax : null, attackAt(sigs.highOnset, o.t) / highMax));
    strong.forEach((o, k) => {
      const band = bands[k];
      let nextSame = null;
      for (let j = k + 1; j < strong.length; j++) if (bands[j] === band) { nextSame = strong[j].t; break; }
      const t1 = o.t + len(Math.min((nextSame ?? o.t + grid.period) - o.t, grid.period * 2), 'legato');
      const side = band === 'high' ? (hat++ % 2 === 0 ? 'L' : 'R') : 'both';
      out.push(...hitsFor(BAND_ROLES[band], side, o.t, t1));
      lastByBand[band] = o.t;
    });
    return out;
  },

  // ═══════════════════════════════════════════════════════════════
  // MOTIFS — high energy
  // ═══════════════════════════════════════════════════════════════

  // A light runs around the car on 8th notes; direction flips every phrase.
  chase(grid) {
    const out = [];
    const n = subdivFor(grid.period, 2, 150);
    let step = 0;
    grid.beats.forEach((b) => {
      const reverse = phraseOf(grid, b) % 2 === 1;
      for (let k = 0; k < n; k++) {
        const t0 = grid.sub(b.i, k, n);
        const stepMs = grid.period / n;
        const posIdx = reverse ? (CIRCLE.length - (step % CIRCLE.length)) % CIRCLE.length : step % CIRCLE.length;
        const t1 = t0 + Math.max(MIN_ON, Math.min(stepMs * 1.6, stepMs * 2 - MIN_GAP));
        CIRCLE[posIdx].forEach(([role, side]) => out.push({ role, side, t0, t1 }));
        step++;
      }
    });
    return out;
  },

  // Whole car on 8th notes, left/right alternating when 8ths are too fast for one light.
  strobe(grid) {
    const out = [];
    const n = subdivFor(grid.period, 2, 110);
    const alternate = grid.period / n < 220;
    grid.beats.forEach((b) => {
      for (let k = 0; k < n; k++) {
        const t0 = grid.sub(b.i, k, n);
        const stepMs = grid.period / n;
        if (alternate) {
          const side = k % 2 === 0 ? 'L' : 'R';
          out.push(...hitsFor(G.all, side, t0, t0 + len(stepMs * 2, 'staccato')));
        } else {
          out.push(...hitsFor(G.all, 'both', t0, t0 + len(stepMs, 'staccato')));
        }
      }
    });
    return out;
  },

  // Driving groove: main lights every beat, blinkers on the off-beats, full car on downbeats.
  drive(grid) {
    const out = [];
    grid.beats.forEach((b) => {
      const roles = b.downbeat ? G.all : G.main;
      out.push(...hitsFor(roles, 'both', b.t, b.t + len(grid.period, 'staccato')));
      const off = grid.sub(b.i, 1, 2);
      if (grid.period / 2 >= 200) out.push(...hitsFor(['blinkF', 'blinkR', 'side'], 'both', off, off + len(grid.period / 2 * 2, 'short')));
    });
    return out;
  },

  // Everything on every beat.
  pulse_all(grid) {
    const out = [];
    const step = grid.period < 350 ? 2 : 1;
    grid.beats.forEach((b, k) => {
      if (k % step !== 0) return;
      out.push(...hitsFor(G.all, 'both', b.t, b.t + len(grid.period * step)));
    });
    return out;
  },

  // ═══════════════════════════════════════════════════════════════
  // MOTIFS — special
  // ═══════════════════════════════════════════════════════════════

  blackout() {
    return [];
  },

  // Main lights held for the whole section (big sustained chords, final notes).
  hold(grid) {
    return hitsFor(G.main, 'both', grid.t0, grid.t1 - MIN_GAP);
  },
};

// ─── Accent overlays (added on top of a motif) ───

const ACCENTS = {
  none: () => [],
  // Full car on every downbeat.
  downbeats(grid) {
    return grid.beats.filter((b) => b.downbeat).flatMap((b) => hitsFor(G.all, 'both', b.t, b.t + len(grid.period, 'staccato')));
  },
  // Brake + plate on the backbeats (2 and 4).
  backbeat(grid) {
    return grid.beats.filter((b) => b.beatInBar % 2 === 1).flatMap((b) => hitsFor(G.accents, 'both', b.t, b.t + len(grid.period * 2, 'staccato')));
  },
  // Blinkers and repeaters on the "and" of each beat.
  offbeats(grid) {
    if (grid.period / 2 < 200) return [];
    return grid.beats.flatMap((b) => {
      const t0 = grid.sub(b.i, 1, 2);
      return hitsFor(['blinkF', 'blinkR', 'side'], 'both', t0, t0 + len(grid.period, 'short'));
    });
  },
  // Strongest attacks of the section, whole car.
  hits(grid) {
    if (!grid.onsets.length) return [];
    const sorted = [...grid.onsets].sort((a, b) => b.strength - a.strength);
    const thr = sorted[Math.floor(sorted.length * 0.15)]?.strength ?? Infinity;
    return grid.onsets.filter((o) => o.strength >= thr && o.strength >= 2.5)
      .flatMap((o) => hitsFor(G.main, 'both', o.t, o.t + len(grid.period, 'staccato')));
  },
};

// Accelerating build over the last bars of a section: quarters, then 8ths, then 16ths.
function buildUp(grid, bars = 2) {
  const downs = grid.beats.filter((b) => b.downbeat);
  if (downs.length < bars) return [];
  const start = downs[downs.length - bars].t;
  const beats = grid.beats.filter((b) => b.t >= start);
  const out = [];
  beats.forEach((b, k) => {
    const progress = k / Math.max(1, beats.length);
    const wanted = progress < 0.5 ? 1 : progress < 0.85 ? 2 : 4;
    const n = subdivFor(grid.period, wanted, 110);
    for (let j = 0; j < n; j++) {
      const t0 = grid.sub(b.i, j, n);
      const stepMs = grid.period / n;
      const alternate = stepMs < 220;
      const side = alternate ? ((k * n + j) % 2 === 0 ? 'L' : 'R') : 'both';
      out.push(...hitsFor(G.main.concat(['blinkF', 'blinkR']), side, t0, t0 + len(alternate ? stepMs * 2 : stepMs, 'staccato')));
    }
  });
  return { hits: out, start };
}

const MOTIF_NAMES = Object.keys(MOTIFS);
const ACCENT_NAMES = Object.keys(ACCENTS);

// Rough energy of each motif (1 calm .. 3 intense), used by the rule designer and checks.
const MOTIF_ENERGY = {
  blackout: 0, breathe: 1, glow: 1, onsets_soft: 1, hold: 1,
  pulse: 2, ping_pong: 2, front_back: 2, wave: 2, onsets: 2, groove: 2, drumkit: 2,
  chase: 3, strobe: 3, drive: 3, pulse_all: 3,
};

module.exports = { MOTIFS, ACCENTS, MOTIF_NAMES, ACCENT_NAMES, MOTIF_ENERGY, makeGrid, buildUp, len, MIN_ON, MIN_GAP, G };
