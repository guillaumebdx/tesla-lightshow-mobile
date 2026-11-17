/**
 * Show renderer: (music analysis + show plan) → timeline events for the app.
 *
 * The plan says WHAT happens in each section (motif, accents, build, impact,
 * closures, Juniper layers). The renderer decides WHEN, from the beat grid only.
 * It then enforces the car constraints per part (min on/off time, no overlaps,
 * closure limits and durations) and returns events in the app's format.
 */

const { MOTIFS, ACCENTS, makeGrid, buildUp, len, MIN_ON, MIN_GAP, G } = require('./motifs');
const { findHighlights, listMoments } = require('./highlights');

const MAX_EVENTS = 4500; // app hard cap is 5000; keep room for user edits

// ─── Car profiles: abstract role → real part IDs ───
const CAR_PROFILES = {
  model_3: {
    head: { L: 'left_high_light', R: 'right_high_light' },
    sig: { L: 'left_signature_light', R: 'right_signature_light' },
    tail: { L: 'light_left_back', R: 'light_right_back' },
    blinkF: { L: 'blink_front_left', R: 'blink_front_right' },
    blinkR: { L: 'blink_back_left', R: 'blink_back_right' },
    side: { L: 'side_repeater_left', R: 'side_repeater_right' },
    brake: { C: 'brake_lights' },
    plate: { C: 'license_plate' },
  },
  model_y_juniper: {
    head: { L: 'light_left_front', R: 'light_right_front' },
    sig: { C: 'light_center_front' },
    tail: { L: 'light_left_back', R: 'light_right_back' },
    rearBar: { C: 'light_center_back' },
    blinkF: { L: 'blink_front_left', R: 'blink_front_right' },
    blinkR: { L: 'blink_back_left', R: 'blink_back_right' },
    side: { L: 'side_repeater_left', R: 'side_repeater_right' },
    brake: { C: 'brake_lights' },
    plate: { C: 'license_plate' },
    reverse: { C: 'reversing_lights' },
  },
};

const JUNIPER_BARS = ['light_center_front', 'light_center_back'];
// Roles kept by a section "focus" (accents, impacts and the ending stay whole-car).
const FOCUS_ROLES = {
  front: new Set(['head', 'sig', 'blinkF', 'side']),
  rear: new Set(['tail', 'rearBar', 'blinkR', 'brake', 'plate', 'reverse', 'side']),
};
const JUNIPER_INTERIOR = [
  'interior_front_door_left',
  'interior_front_door_right',
  'interior_front_central',
  'interior_back_door_left',
  'interior_back_door_right',
];
// Parts dropped first when a show is over the event budget.
const DROP_ORDER = ['side_repeater_left', 'side_repeater_right', 'license_plate', 'blink_back_left', 'blink_back_right', 'blink_front_left', 'blink_front_right'];

function resolveParts(profile, role, side) {
  const map = profile[role];
  if (!map) return [];
  if (map.C) return [map.C];
  if (side === 'L') return [map.L];
  if (side === 'R') return [map.R];
  return [map.L, map.R];
}

// ─── Event construction (same shape as the app's events) ───
function makeEvent(part, startMs, endMs, opts = {}) {
  return {
    part,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    effect: 'solid',
    power: opts.power ?? 100,
    blinkSpeed: 0,
    pulseSpeed: 0,
    easeIn: !!opts.easeIn,
    easeOut: !!opts.easeOut,
    ...(opts.retroMode ? { retroMode: opts.retroMode } : {}),
    ...(opts.windowMode ? { windowMode: opts.windowMode, windowDurationMs: opts.windowDurationMs } : {}),
    ...(opts.trunkMode ? { trunkMode: opts.trunkMode } : {}),
    ...(opts.flapMode ? { flapMode: opts.flapMode } : {}),
    ...(opts.rgbColor !== undefined ? { rgbColor: opts.rgbColor } : {}),
    ...(opts.rgbRainbow !== undefined ? { rgbRainbow: opts.rgbRainbow } : {}),
    ...(opts.rgbSync !== undefined ? { rgbSync: opts.rgbSync } : {}),
  };
}

/**
 * Per part: sort hits, then make sure every on-time is >= MIN_ON and every gap
 * between two hits is >= MIN_GAP (shorten the earlier hit, or merge the two).
 * Overlapping hits are merged. Eased (dimmable) hits are kept as they are.
 */
function normalizePart(intervals, durationMs) {
  const solid = intervals.filter((h) => !h.easeIn && !h.easeOut).sort((a, b) => a.t0 - b.t0);
  // An eased hit overlapping a solid one on the same part is dropped: the export keeps the
  // max of overlapping events, but the app's 3D preview shows only one of them.
  const eased = intervals.filter((h) => (h.easeIn || h.easeOut) && !solid.some((x) => x.t0 < h.t1 && x.t1 > h.t0));
  const out = [];
  for (const h of solid) {
    const t0 = Math.max(0, h.t0);
    let t1 = Math.min(durationMs, h.t1);
    if (t1 - t0 < MIN_ON) t1 = Math.min(durationMs, t0 + MIN_ON);
    if (t1 <= t0) continue;
    const prev = out[out.length - 1];
    if (prev && t0 < prev.t1 + MIN_GAP) {
      if (t0 - MIN_GAP - prev.t0 >= MIN_ON) {
        // Cut the previous hit 100 ms before this one: the light dips just
        // before the beat and comes back on it, which reads as a pulse.
        const prevEnd = prev.t1;
        prev.t1 = t0 - MIN_GAP;
        out.push({ ...h, t0, t1: Math.max(t1, prevEnd) });
      } else {
        prev.t1 = Math.max(prev.t1, t1);
      }
    } else {
      out.push({ ...h, t0, t1 });
    }
  }
  // Eased hits must not overlap each other either: each one stops where the next starts.
  const easedOut = eased.map((h) => ({ ...h, t0: Math.max(0, h.t0), t1: Math.min(durationMs, h.t1) })).sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i + 1 < easedOut.length; i++) easedOut[i].t1 = Math.min(easedOut[i].t1, easedOut[i + 1].t0);
  return out.concat(easedOut.filter((h) => h.t1 - h.t0 >= MIN_ON));
}

// ═══════════════════════════════════════════════════════════════
// Closures
// ═══════════════════════════════════════════════════════════════

const TRUNK_OPEN_MS = 13000;
const TRUNK_CLOSE_MS = 4000;
const MIRROR_ROUNDTRIP_MS = 4000;
const WINDOWS_TOTAL_MAX_MS = 28000;
const FLAP_OPEN_MS = 2000;

function firstDownbeatAfter(analysis, t) {
  const b = analysis.beats.find((x) => x.downbeat && x.t >= t - 1);
  return b ? b.t : null;
}

function lastDownbeatBefore(analysis, t) {
  let best = null;
  for (const b of analysis.beats) {
    if (b.t > t) break;
    if (b.downbeat) best = b.t;
  }
  return best;
}

function renderClosures(plan, analysis, segById, durationMs, endLimitMs) {
  const events = [];
  const c = plan.closures || {};
  const used = { mirrors: 0, windowsMs: 0, trunk: false, flap: false };

  // Mirrors: roundtrip on a downbeat, max 6 (= 12 of the 20 commands per mirror).
  let lastMirror = -Infinity;
  for (const id of (c.mirrors || []).slice(0, 6)) {
    const seg = segById.get(id);
    if (!seg) continue;
    const segBars = analysis.bars.filter((b) => b.t0 >= seg.t0 && b.t0 < seg.t1);
    // Fold exactly on the section's biggest drop when it has one.
    const drops = (analysis.highlights ? analysis.highlights.drops : []).filter((d) => d.t >= seg.t0 && d.t < seg.t1);
    const bigDrop = drops.length ? drops.reduce((a, b) => (b.strength > a.strength ? b : a)) : null;
    const at = bigDrop ? bigDrop.t : segBars.length > 4 ? segBars[Math.min(segBars.length - 1, 2)].t0 : firstDownbeatAfter(analysis, seg.t0);
    if (at === null || at - lastMirror < 8000 || at + MIRROR_ROUNDTRIP_MS > endLimitMs) continue;
    for (const part of ['retro_left', 'retro_right']) {
      events.push(makeEvent(part, at, at + MIRROR_ROUNDTRIP_MS, { retroMode: 'roundtrip' }));
    }
    lastMirror = at;
    used.mirrors++;
  }

  // Windows: dance on a section, ~30 s per show in total (thermal limit).
  for (const id of (c.windows || []).slice(0, 2)) {
    const seg = segById.get(id);
    if (!seg) continue;
    const remaining = WINDOWS_TOTAL_MAX_MS - used.windowsMs;
    const dur = Math.min(seg.t1 - seg.t0, 15000, remaining, endLimitMs - seg.t0);
    if (dur < 5000) continue;
    for (const part of ['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back']) {
      events.push(makeEvent(part, seg.t0, seg.t0 + dur, { windowMode: 'window_dance', windowDurationMs: Math.round(dur) }));
    }
    used.windowsMs += dur;
  }

  // Trunk: open (~13 s) so that it is fully open when the chosen section starts,
  // dance during the section, then close.
  if (c.trunk !== null && c.trunk !== undefined) {
    const seg = segById.get(c.trunk);
    if (seg) {
      const openAt = lastDownbeatBefore(analysis, seg.t0 - TRUNK_OPEN_MS) ?? (seg.t0 - TRUNK_OPEN_MS);
      const danceEnd = Math.min(seg.t1, seg.t0 + 15000);
      if (openAt >= 0 && danceEnd - seg.t0 >= 5000 && danceEnd + TRUNK_CLOSE_MS <= endLimitMs) {
        events.push(makeEvent('trunk', openAt, openAt + TRUNK_OPEN_MS, { trunkMode: 'trunk_open' }));
        events.push(makeEvent('trunk', seg.t0, danceEnd, { trunkMode: 'trunk_dance' }));
        events.push(makeEvent('trunk', danceEnd, danceEnd + TRUNK_CLOSE_MS, { trunkMode: 'trunk_close' }));
        used.trunk = true;
      }
    }
  }

  // Charge port: open on the section start, rainbow, close (3 commands = limit).
  if (c.flap !== null && c.flap !== undefined) {
    const seg = segById.get(c.flap);
    if (seg) {
      const rainbowEnd = Math.min(seg.t1, seg.t0 + FLAP_OPEN_MS + 12000);
      if (rainbowEnd - seg.t0 >= 6000 && rainbowEnd + FLAP_OPEN_MS <= endLimitMs) {
        events.push(makeEvent('flap', seg.t0, seg.t0 + FLAP_OPEN_MS, { flapMode: 'flap_open' }));
        events.push(makeEvent('flap', seg.t0 + FLAP_OPEN_MS, rainbowEnd, { flapMode: 'flap_rainbow' }));
        events.push(makeEvent('flap', rainbowEnd, rainbowEnd + FLAP_OPEN_MS, { flapMode: 'flap_close' }));
        used.flap = true;
      }
    }
  }
  return { events, used };
}

// ═══════════════════════════════════════════════════════════════
// Juniper layers: center light bars (dimmable) and interior RGB
// ═══════════════════════════════════════════════════════════════

function renderBars(mode, grid, level) {
  const power = Math.round(50 + 50 * Math.min(1, Math.max(0, level)));
  const out = [];
  if (mode === 'beat') {
    grid.beats.forEach((b) => {
      const t1 = b.t + Math.max(MIN_ON * 2, b.end - b.t - 20);
      JUNIPER_BARS.forEach((part) => out.push({ part, t0: b.t, t1, easeOut: true, power }));
    });
  } else if (mode === 'swell') {
    const downs = grid.beats.filter((b) => b.downbeat);
    downs.forEach((b, k) => {
      const next = downs[k + 1] ? downs[k + 1].t : grid.t1;
      JUNIPER_BARS.forEach((part) => out.push({ part, t0: b.t, t1: next - 20, easeIn: true, easeOut: true, power }));
    });
  }
  return out;
}

function renderInterior(spec, grid) {
  if (!spec || spec.mode === 'off') return [];
  const color = /^#[0-9a-fA-F]{6}$/.test(spec.color || '') ? spec.color : '#ffffff';
  const out = [];
  const whole = (opts) => JUNIPER_INTERIOR.forEach((part) => out.push({ part, t0: grid.t0, t1: grid.t1 - 20, ...opts }));
  if (spec.mode === 'color') whole({ rgbColor: color, rgbRainbow: false, rgbSync: false, easeIn: true });
  else if (spec.mode === 'rainbow') whole({ rgbRainbow: true, rgbSync: false, easeIn: true });
  else if (spec.mode === 'sync') whole({ rgbSync: true, rgbRainbow: false });
  else if (spec.mode === 'pulse') {
    // Color hit with decay on every downbeat.
    const downs = grid.beats.filter((b) => b.downbeat);
    downs.forEach((b, k) => {
      const next = downs[k + 1] ? downs[k + 1].t : grid.t1;
      JUNIPER_INTERIOR.forEach((part) => out.push({ part, t0: b.t, t1: next - 20, rgbColor: color, rgbRainbow: false, rgbSync: false, easeOut: true }));
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Moment effects (drops, stops, hits, risers)
// ═══════════════════════════════════════════════════════════════

// Remove/trim hits overlapping [a, b): what starts inside goes, what overlaps is cut.
function clearWindow(hits, a, b) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (h.t1 <= a || h.t0 >= b) continue;
    if (h.t0 < a) {
      const tail = h.t1 > b ? { ...h, t0: b } : null;
      h.t1 = a;
      if (tail && tail.t1 - tail.t0 >= MIN_ON) hits.push(tail);
    } else if (h.t1 > b) {
      h.t0 = b;
    } else {
      hits.splice(i, 1);
    }
  }
}

function beatIndexAt(analysis, t) {
  let best = 0;
  analysis.beats.forEach((b, i) => { if (Math.abs(b.t - t) < Math.abs(analysis.beats[best].t - t)) best = i; });
  return best;
}

/**
 * Explosion on a drop, over one bar: whole car on the beat, then left/right
 * strobe on 16ths (8ths if 16ths are too fast for the car), then an afterglow
 * on the tail lights while the bar ends.
 */
function explosion(analysis, t, roleHits, partHits, isJuniper) {
  const p = analysis.tempo.periodMs;
  const beats = analysis.beats;
  const bi = beatIndexAt(analysis, t);
  const barLen = p * analysis.meter;
  const end = t + barLen;
  clearWindow(roleHits, t, end);
  const out = [];
  out.push(...G.all.map((role) => ({ role, side: 'both', t0: t, t1: t + Math.max(250, 0.6 * p) })));
  const n = p / 4 >= 110 ? 4 : 2;
  const strobeBeats = Math.max(1, analysis.meter - 2);
  for (let k = 1; k <= strobeBeats; k++) {
    const b = beats[bi + k];
    if (!b) break;
    const next = beats[bi + k + 1] ? beats[bi + k + 1].t : b.t + p;
    for (let j = 0; j < n; j++) {
      const t0 = b.t + ((next - b.t) * j) / n;
      const step = (next - b.t) / n;
      const side = j % 2 === 0 ? 'L' : 'R';
      out.push(...['head', 'sig', 'tail', 'blinkF', 'blinkR', 'side'].map((role) => ({ role, side, t0, t1: t0 + Math.max(MIN_ON, Math.min(step * 2 - MIN_GAP, step * 1.2)) })));
    }
  }
  const glowStart = beats[bi + strobeBeats + 1] ? beats[bi + strobeBeats + 1].t : t + p * (strobeBeats + 1);
  if (glowStart < end - MIN_ON) out.push(...['tail', 'rearBar', 'brake'].map((role) => ({ role, side: 'both', t0: glowStart, t1: end - MIN_GAP })));
  roleHits.push(...out);
  if (isJuniper) {
    JUNIPER_BARS.forEach((part) => partHits.push({ part, t0: t, t1: end - 20, easeOut: true, power: 100 }));
    JUNIPER_INTERIOR.forEach((part) => partHits.push({ part, t0: t, t1: t + 2 * p, rgbColor: '#ffffff', rgbRainbow: false, rgbSync: false, easeOut: true }));
  }
}

function flash(analysis, t, roleHits, partHits, isJuniper) {
  const p = analysis.tempo.periodMs;
  const dur = Math.max(200, 0.45 * p);
  // Short dip before, so the flash reads as a new attack even in a busy section.
  clearWindow(roleHits, t - 120, t + dur);
  roleHits.push(...G.all.map((role) => ({ role, side: 'both', t0: t, t1: t + dur })));
  if (isJuniper) JUNIPER_BARS.forEach((part) => partHits.push({ part, t0: t, t1: t + p, easeOut: true, power: 100 }));
}

function applyMoments(plan, analysis, roleHits, partHits, isJuniper) {
  const h = analysis.highlights;
  const moments = listMoments(h);
  const chosen = new Map((plan.moments || []).map((m) => [m.id, m.fx]));
  const p = analysis.tempo.periodMs;
  const applied = [];
  let lastFxEnd = -Infinity; // a riser must not erase the previous moment's effect
  let lastExplosion = -Infinity;
  for (const m of moments) {
    let fx = chosen.has(m.id) ? chosen.get(m.id) : m.fx;
    // Explosions stay rare whatever the plan says (one per 12 s at most).
    if (fx === 'explosion' && m.t - lastExplosion < 12000) fx = 'flash';
    if (fx === 'explosion') lastExplosion = m.t;
    if (!fx || fx === 'none') continue;
    if (m.type === 'drop') {
      // Riser into the drop: accelerate over it (unless the section already builds).
      const riser = h.risers.find((r) => Math.abs(r.t1 - m.t) < p);
      if (riser && fx === 'explosion') {
        const grid = makeGrid(analysis, { id: -1, t0: riser.t, t1: m.t });
        const b = buildUp(grid, Math.min(4, riser.bars));
        if (b && b.hits) {
          const start = Math.max(b.start, lastFxEnd);
          clearWindow(roleHits, start, m.t);
          roleHits.push(...b.hits.filter((x) => x.t0 >= start));
        }
      }
      // Blackout before the drop: during the stop that precedes it, or a half-beat "breath".
      const stop = h.stops.find((s) => m.t >= s.t1 - 400 && m.t - s.t1 < 1500);
      if (stop) clearWindow(roleHits, stop.t, m.t);
      // No stop before it: a one-beat "breath" of darkness makes the explosion land.
      else if (fx === 'explosion') {
        clearWindow(roleHits, m.t - Math.min(600, Math.max(200, p)), m.t);
        clearWindow(partHits, m.t - Math.min(600, Math.max(200, p)), m.t);
      }
      if (stop) clearWindow(partHits, stop.t, m.t);
      if (fx === 'explosion') explosion(analysis, m.t, roleHits, partHits, isJuniper);
      else flash(analysis, m.t, roleHits, partHits, isJuniper);
    } else if (m.type === 'intro') {
      // The music arrives: whatever was before (soft intro) goes dark, then the car explodes.
      clearWindow(roleHits, m.t - Math.min(600, p), m.t);
      clearWindow(partHits, m.t - Math.min(600, p), m.t);
      if (fx === 'explosion') explosion(analysis, m.t, roleHits, partHits, isJuniper);
      else flash(analysis, m.t, roleHits, partHits, isJuniper);
    } else if (m.type === 'stop') {
      clearWindow(roleHits, m.t, m.t1);
      clearWindow(partHits, m.t, m.t1);
      flash(analysis, m.t1, roleHits, partHits, isJuniper);
    } else if (m.type === 'hit') {
      flash(analysis, m.t, roleHits, partHits, isJuniper);
    }
    applied.push({ ...m, fx });
    lastFxEnd = Math.max(lastFxEnd, (m.t1 || m.t) + (fx === 'explosion' ? p * analysis.meter : p));
  }
  return applied;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

function renderShow(plan, analysis, carModel = 'model_3') {
  const isJuniper = carModel === 'model_y_juniper';
  const profile = CAR_PROFILES[isJuniper ? 'model_y_juniper' : 'model_3'];
  const durationMs = analysis.durationMs;
  if (!analysis.highlights) analysis.highlights = findHighlights(analysis);
  const segById = new Map(analysis.segments.map((s) => [s.id, s]));
  const planById = new Map((plan.sections || []).map((s) => [s.id, s]));
  const roleHits = [];
  const partHits = []; // already resolved to parts (Juniper layers)

  analysis.segments.forEach((seg, k) => {
    const spec = planById.get(seg.id) || { motif: 'pulse', accent: 'none' };
    const grid = makeGrid(analysis, seg);
    if (!grid.beats.length && !grid.onsets.length) return;
    const motif = MOTIFS[spec.motif] || MOTIFS.pulse;
    let hits = motif(grid);
    const keep = FOCUS_ROLES[spec.focus];
    if (keep) hits = hits.filter((h) => keep.has(h.role));
    const accent = ACCENTS[spec.accent] || ACCENTS.none;
    hits = hits.concat(accent(grid));

    // Build-up into the next section replaces the end of this one.
    const next = analysis.segments[k + 1];
    if (spec.build && next) {
      const b = buildUp(grid, grid.beats.filter((x) => x.downbeat).length >= 6 ? 2 : 1);
      if (b && b.hits) hits = hits.filter((h) => h.t0 < b.start).concat(b.hits);
    }
    // Impact: whole car on the first beat of the section.
    if (spec.impact && grid.beats.length) {
      const t0 = grid.beats[0].t;
      hits.push(...G.all.map((role) => ({ role, side: 'both', t0, t1: t0 + len(grid.period * 2, 'legato') })));
    }
    roleHits.push(...hits);

    if (isJuniper) {
      partHits.push(...renderBars(spec.bars || 'off', grid, seg.level));
      partHits.push(...renderInterior(spec.interior, grid));
    }
  });

  // Song-specific moments: drops, stops, hits (+ risers into drops).
  const momentsApplied = applyMoments(plan, analysis, roleHits, partHits, isJuniper);

  // Ending: big hit on the last strong attack, held a little.
  const ending = analysis.moments.find((m) => m.type === 'ending');
  if (ending && plan.ending !== 'none') {
    const holdMs = Math.min(2500, Math.max(800, analysis.tempo.periodMs * 2));
    // Clear anything after the ending hit so the show finishes on it.
    for (let i = roleHits.length - 1; i >= 0; i--) if (roleHits[i].t0 > ending.t) roleHits.splice(i, 1);
    roleHits.push(...G.all.map((role) => ({ role, side: 'both', t0: ending.t, t1: ending.t + holdMs })));
  }

  // Resolve roles to parts.
  const byPart = new Map();
  const add = (part, h) => {
    if (!byPart.has(part)) byPart.set(part, []);
    byPart.get(part).push(h);
  };
  for (const h of roleHits) {
    for (const part of resolveParts(profile, h.role, h.side)) add(part, { t0: h.t0, t1: h.t1 });
  }
  for (const h of partHits) add(h.part, h);

  // Fill long total-dark gaps (sparse onsets, front/rear-only sections) with a
  // soft tail-light hold that starts on a beat. Deliberate blackouts are kept.
  const blackout = analysis.segments.filter((s) => planById.get(s.id)?.motif === 'blackout');
  const lit = [];
  for (const [part, hits] of byPart) {
    if (JUNIPER_INTERIOR.includes(part)) continue;
    hits.forEach((h) => lit.push([h.t0, h.t1]));
  }
  lit.sort((a, b) => a[0] - b[0]);
  const fillGap = Math.max(1200, analysis.tempo.periodMs * 2);
  const showEnd = ending ? ending.t : analysis.musicEndMs;
  let cursor = analysis.musicStartMs;
  const gaps = [];
  for (const [a, b] of lit.concat([[showEnd, showEnd]])) {
    if (a - cursor >= fillGap) gaps.push([cursor, Math.min(a, showEnd)]);
    cursor = Math.max(cursor, b);
    if (cursor >= showEnd) break;
  }
  for (const [g0, g1] of gaps) {
    if (blackout.some((s) => g0 < s.t1 && g1 > s.t0)) continue;
    const beat = analysis.beats.find((b) => b.t >= g0 + MIN_GAP && b.t <= g1 - 400);
    if (!beat) continue;
    for (const part of resolveParts(profile, 'tail', 'both')) add(part, { t0: beat.t, t1: g1 - MIN_GAP });
  }

  // Normalize per part, build events.
  let events = [];
  for (const [part, hits] of byPart) {
    for (const h of normalizePart(hits, durationMs)) {
      events.push(makeEvent(part, h.t0, h.t1, h));
    }
  }

  // Event budget: drop the least important parts first.
  for (const part of DROP_ORDER) {
    if (events.length <= MAX_EVENTS) break;
    events = events.filter((e) => e.part !== part);
  }
  if (events.length > MAX_EVENTS) events = events.sort((a, b) => a.startMs - b.startMs).slice(0, MAX_EVENTS);

  const endLimitMs = Math.min(durationMs, analysis.musicEndMs + 1000);
  const closures = renderClosures(plan, analysis, segById, durationMs, endLimitMs);
  events = events.concat(closures.events).sort((a, b) => a.startMs - b.startMs || a.part.localeCompare(b.part));
  events.forEach((e, i) => { e.id = `ai_${i + 1}`; });
  return { events, closuresUsed: closures.used, moments: momentsApplied };
}

module.exports = { renderShow, CAR_PROFILES, JUNIPER_INTERIOR, JUNIPER_BARS, MAX_EVENTS };
