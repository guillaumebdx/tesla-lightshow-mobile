#!/usr/bin/env node
/**
 * Generate shows for the 8 built-in tracks and score them (tests/showMetrics.js).
 *
 *   node tests/eval-show.js                      # new engine, rule designer (free)
 *   node tests/eval-show.js --designer llm       # new engine, LLM designer (paid)
 *   node tests/eval-show.js --old                # previous generator (paid, cached in tests/output/old)
 *   options: --car model_y_juniper  --source waveform  --tracks a,b  --prompt "..."  --save
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { analyzeMusic } = require('../src/services/showEngine/analysis');
const { scoreShow, planMetrics } = require('./showMetrics');
const { validateEvents } = require('./validateEvents');

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const ROOT = path.join(__dirname, '..', '..');
const FEATURES_DIR = path.join(__dirname, '..', 'src', 'data', 'trackFeatures');
const REF_DIR = path.join(__dirname, 'fixtures', 'reference-beats');
const OUT_DIR = path.join(__dirname, 'output');
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

function loadTrack(id) {
  const track = JSON.parse(fs.readFileSync(path.join(FEATURES_DIR, `${id}.json`), 'utf8'));
  const ref = JSON.parse(fs.readFileSync(path.join(REF_DIR, `${id}.json`), 'utf8'));
  const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'mp3', `${WAVEFORM_FILES[id]}.waveform.json`), 'utf8'));
  return { ...track, ref, waveform: wf.bars };
}

async function generate(track, opts) {
  if (opts.old) {
    const cache = path.join(OUT_DIR, 'old', `${track.id}.${opts.car}.json`);
    if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
    const { generateLightShow } = require('../src/services/llmServiceV1');
    // Same input as production: waveform downsampled to 1000 points.
    const bucket = track.waveform.length / 1000;
    const down = Array.from({ length: Math.min(1000, track.waveform.length) }, (_, i) => {
      let m = 0;
      for (let j = Math.floor(i * bucket); j < Math.floor((i + 1) * bucket); j++) m = Math.max(m, track.waveform[j] || 0);
      return m;
    });
    const r = await generateLightShow({ waveform: down, durationMs: track.durationMs, mood: 'auto', trackTitle: track.title, carModel: opts.car, userPrompt: opts.prompt });
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(r));
    return r;
  }
  const { generateShowV2 } = require('../src/services/showEngine');
  return generateShowV2({
    features: opts.source === 'waveform' ? undefined : track.features,
    waveform: track.waveform,
    durationMs: track.durationMs,
    // "waveform" simulates an imported track on an old app: no features, unknown title.
    trackTitle: opts.source === 'waveform' ? `${track.title} (imported)` : track.title,
    mood: 'auto',
    userPrompt: opts.prompt,
    carModel: opts.car,
    designer: opts.designer,
    designerModel: opts.model,
    designerReasoning: opts.reasoning,
  });
}

async function main() {
  const opts = {
    old: !!arg('old', false),
    car: arg('car', 'model_3'),
    source: arg('source', 'features'),
    designer: arg('designer', 'rules'),
    prompt: arg('prompt', undefined),
    model: arg('model', undefined),
    reasoning: arg('reasoning', undefined),
  };
  const ids = arg('tracks', null) ? String(arg('tracks')).split(',') : Object.keys(WAVEFORM_FILES);
  const rows = [];
  for (const id of ids) {
    const track = loadTrack(id);
    // Score against the best analysis we have (features), whatever the show was made from.
    const analysis = analyzeMusic({ features: track.features, durationMs: track.durationMs });
    const t0 = Date.now();
    const result = await generate(track, opts);
    const ms = Date.now() - t0;
    const m = scoreShow(result.events, track.ref, analysis);
    const pm = result.plan ? planMetrics(result.plan, analysis) : {};
    const problems = await validateEvents(result.events, { carModel: opts.car, durationMs: track.durationMs });
    if (problems.length) console.log(`  ${id}: ${problems.length} app-rule problem(s):\n    ${problems.slice(0, 8).join('\n    ')}`);
    pm.invalid = problems.length;
    rows.push({ track: id, ...m, ...pm, cost: result.meta?.estimatedCost ? +result.meta.estimatedCost.toFixed(4) : 0, s: +(ms / 1000).toFixed(1) });
    if (arg('save', false)) {
      const dir = path.join(OUT_DIR, opts.old ? 'old-show' : `${opts.designer}-${opts.source}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${id}.${opts.car}.json`), JSON.stringify(result));
    }
  }
  console.table(rows);
  const keys = ['inSync', 'chance', 'onGrid', 'beatHit', 'darkPct', 'longestDarkS', 'energyCorr', 'shortOn', 'shortOff', 'momentHit', 'momentImpact', 'grooveFid', 'events', 'cost', 'eMatch', 'coher', 'contrast', 'buildOk', 'invalid', 's'];
  // Mean over the tracks where the metric exists (moment metrics are null on tracks without big moments).
  const avg = {};
  for (const k of keys) {
    const vals = rows.map((r) => r[k]).filter((v) => typeof v === 'number');
    if (vals.length) avg[k] = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
  }
  console.log('MEAN', JSON.stringify(avg));
}

main().catch((e) => { console.error(e); process.exit(1); });
