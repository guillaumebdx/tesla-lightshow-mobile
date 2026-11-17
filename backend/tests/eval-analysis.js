#!/usr/bin/env node
/**
 * Offline check of the music analysis (no API call, free).
 *
 * Compares the beats found by showEngine/analysis.js with reference beats
 * computed by librosa (tests/fixtures/reference-beats, regenerate with
 * tests/tools/ref_beats.py), for both inputs the backend can receive:
 *   - features: audio features v1 (new app versions, built-in tracks)
 *   - waveform: legacy 2000 RMS bars (old app versions, imported tracks)
 *
 * Usage: node tests/eval-analysis.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { analyzeMusic } = require('../src/services/showEngine/analysis');

const ROOT = path.join(__dirname, '..', '..');
const FEATURES_DIR = path.join(__dirname, '..', 'src', 'data', 'trackFeatures');
const REF_DIR = path.join(__dirname, 'fixtures', 'reference-beats');
const VERBOSE = process.argv.includes('--verbose');

const WAVEFORM_FILES = {
  jingle_bells: 'the_mountain-jingle-bells-449466',
  jingle_bells_metal: 'the_mountain-jingle-bells-metal-449464',
  new_year_countdown: 'starostin-new-year-countdown-455341',
  halloween: 'viacheslavstarostin-halloween-background-music-424167',
  happy_birthday: 'starostin-happy-birthday-357371',
  classical_piano: 'hitslab-classical-piano-background-music-372077',
  moonlight_mambo: 'lvbratija-moonlight-mambo-365881',
  star_wars_battle: 'luis_humanoide-star-wars-style-battle-music-148641',
};

// Beat F-measure with ±tol ms (mir_eval style, one-to-one matching).
function fMeasure(est, ref, tol = 70) {
  if (!est.length || !ref.length) return { f: 0, offset: 0 };
  let matched = 0;
  const offsets = [];
  let j = 0;
  const used = new Set();
  for (const e of est) {
    while (j < ref.length && ref[j] < e - tol) j++;
    for (let k = j; k < ref.length && ref[k] <= e + tol; k++) {
      if (!used.has(k)) { used.add(k); matched++; offsets.push(e - ref[k]); break; }
    }
  }
  const p = matched / est.length;
  const r = matched / ref.length;
  const off = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
  return { f: p + r > 0 ? (2 * p * r) / (p + r) : 0, offset: off };
}

// Same, but also accept the reference at double / half / off-beat metrical levels.
function bestLevelF(est, ref) {
  const doubled = [];
  for (let i = 0; i < ref.length; i++) {
    doubled.push(ref[i]);
    if (i + 1 < ref.length) doubled.push((ref[i] + ref[i + 1]) / 2);
  }
  const halfA = ref.filter((_, i) => i % 2 === 0);
  const halfB = ref.filter((_, i) => i % 2 === 1);
  const offbeat = ref.slice(0, -1).map((t, i) => (t + ref[i + 1]) / 2);
  const variants = { same: ref, double: doubled, halfA, halfB, offbeat };
  let best = { level: 'same', f: 0, offset: 0 };
  for (const [level, r] of Object.entries(variants)) {
    const m = fMeasure(est, r);
    if (m.f > best.f) best = { level, ...m };
  }
  return { exact: fMeasure(est, ref), best };
}

function run() {
  const rows = [];
  for (const file of fs.readdirSync(REF_DIR).filter((f) => f.endsWith('.json'))) {
    const ref = JSON.parse(fs.readFileSync(path.join(REF_DIR, file), 'utf8'));
    const track = JSON.parse(fs.readFileSync(path.join(FEATURES_DIR, file), 'utf8'));
    const wf = require(path.join(ROOT, 'assets', 'mp3', `${WAVEFORM_FILES[ref.id]}.waveform.json`));
    const durationMs = track.durationMs;

    for (const source of ['features', 'waveform']) {
      const t0 = Date.now();
      const a = source === 'features'
        ? analyzeMusic({ features: track.features, durationMs })
        : analyzeMusic({ waveform: wf.bars, durationMs });
      const ms = Date.now() - t0;
      const est = a.beats.map((b) => b.t);
      const { exact, best } = bestLevelF(est, ref.beats);
      rows.push({
        track: ref.id,
        src: source,
        refBpm: Math.round(ref.bpm),
        bpm: Math.round(a.tempo.bpm),
        fExact: exact.f.toFixed(2),
        fBest: best.f.toFixed(2),
        level: best.level,
        offMs: Math.round(best.offset),
        clarity: a.tempo.pulseClarity,
        meter: a.meter,
        segs: a.segments.map((s) => `${s.label}${Math.round(s.level * 9)}`).join(' '),
        ms,
      });
      if (VERBOSE && source === 'features') {
        console.log(`\n${ref.id}: ${a.segments.length} segments`);
        for (const s of a.segments) {
          console.log(`  ${(s.t0 / 1000).toFixed(1)}-${(s.t1 / 1000).toFixed(1)}s ${s.label} level=${s.level} ${s.trend} dens=${s.relDensity} bars=${s.barEnd - s.barStart}`);
        }
        console.log('  moments:', a.moments.map((m) => `${m.type}@${(m.t / 1000).toFixed(1)}`).join(', '));
      }
    }
  }
  console.table(rows);
  for (const src of ['features', 'waveform']) {
    const r = rows.filter((x) => x.src === src);
    const avg = (k) => (r.reduce((s, x) => s + parseFloat(x[k]), 0) / r.length).toFixed(2);
    console.log(`${src}: mean F exact=${avg('fExact')} best-level=${avg('fBest')}`);
  }
}

run();
