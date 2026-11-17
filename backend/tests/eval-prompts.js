#!/usr/bin/env node
/**
 * Does the LLM designer follow the user's creative direction?
 * Typical user requests, each with a deterministic check on the plan.
 * Paid: one LLM call per scenario.
 *
 *   node tests/eval-prompts.js --model gpt-5.5 --reasoning low
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { analyzeMusic } = require('../src/services/showEngine/analysis');
const { designShowLLM } = require('../src/services/showEngine/llmDesigner');
const { MOTIF_ENERGY } = require('../src/services/showEngine/motifs');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const MODEL = arg('model', undefined);
const REASONING = arg('reasoning', undefined);

const energy = (plan) => plan.sections.map((s) => MOTIF_ENERGY[s.motif] ?? 1);
const meanOf = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const hue = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return null;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
};

const SCENARIOS = [
  {
    name: 'chill',
    track: 'moonlight_mambo',
    prompt: 'Ambiance chill et élégante, tout en douceur',
    check: (p) => {
      const ex = (p.moments || []).filter((m) => m.fx === 'explosion').length;
      return { ok: meanOf(energy(p)) <= 1.6 && !energy(p).includes(3) && ex === 0, detail: `mean energy ${meanOf(energy(p)).toFixed(2)}, explosions ${ex}` };
    },
  },
  {
    name: 'default-wow',
    track: 'moonlight_mambo',
    prompt: undefined,
    check: (p) => {
      const ex = (p.moments || []).filter((m) => m.fx === 'explosion').length;
      const songMotifs = p.sections.filter((s) => ['groove', 'drumkit'].includes(s.motif)).length;
      return { ok: ex >= 1 && songMotifs >= 1, detail: `explosions ${ex}, groove/drumkit sections ${songMotifs}/${p.sections.length}` };
    },
  },
  {
    name: 'max-strobe',
    track: 'star_wars_battle',
    prompt: 'Strobes à fond, intensité maximale du début à la fin !',
    check: (p) => {
      const high = energy(p).filter((e) => e === 3).length / p.sections.length;
      return { ok: high >= 0.6 && p.sections.some((s) => s.motif === 'strobe'), detail: `high share ${high.toFixed(2)}` };
    },
  },
  {
    name: 'no-closures',
    track: 'star_wars_battle',
    prompt: 'No moving parts please, only lights.',
    check: (p) => {
      const c = p.closures;
      return { ok: !c.mirrors.length && !c.windows.length && c.trunk === null && c.flap === null, detail: JSON.stringify(c) };
    },
  },
  {
    name: 'trunk-windows',
    track: 'moonlight_mambo',
    prompt: 'Je veux voir le coffre danser et les fenêtres bouger',
    check: (p) => ({ ok: p.closures.trunk !== null && p.closures.windows.length > 0, detail: JSON.stringify(p.closures) }),
  },
  {
    name: 'rear-only',
    track: 'happy_birthday',
    prompt: 'Only use the rear lights',
    check: (p) => {
      const lit = p.sections.filter((s) => s.motif !== 'blackout');
      const rear = lit.filter((s) => s.focus === 'rear').length / Math.max(1, lit.length);
      return { ok: rear >= 0.8, detail: `rear share ${rear.toFixed(2)}` };
    },
  },
  {
    name: 'halloween-colors',
    track: 'halloween',
    car: 'model_y_juniper',
    prompt: 'Halloween effrayant, ambiance rouge et violette',
    check: (p) => {
      const on = p.sections.filter((s) => ['color', 'pulse'].includes(s.interior.mode));
      const ok = on.filter((s) => { const h = hue(s.interior.color); return h !== null && (h >= 250 || h <= 25); }).length;
      return { ok: on.length > 0 && ok / on.length >= 0.7, detail: `${ok}/${on.length} red/purple, modes ${p.sections.map((s) => s.interior.mode).join(',')}` };
    },
  },
  {
    name: 'default-follows-energy',
    track: 'classical_piano',
    prompt: undefined,
    check: (p, a) => {
      const lv = a.segments.map((s) => s.level);
      const e = energy(p);
      const lowCalm = a.segments.filter((s, i) => s.level < 0.3 && e[i] <= 1).length / Math.max(1, lv.filter((l) => l < 0.3).length);
      const highStrong = a.segments.filter((s, i) => s.level >= 0.65 && e[i] >= 2).length / Math.max(1, lv.filter((l) => l >= 0.65).length);
      return { ok: lowCalm >= 0.7 && highStrong >= 0.7, detail: `calm ok ${lowCalm.toFixed(2)}, high ok ${highStrong.toFixed(2)}` };
    },
  },
];

(async () => {
  const rows = [];
  let cost = 0;
  for (const sc of SCENARIOS) {
    const tr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'trackFeatures', `${sc.track}.json`), 'utf8'));
    const a = analyzeMusic({ features: tr.features, durationMs: tr.durationMs });
    try {
      const r = await designShowLLM(a, { trackTitle: tr.title, mood: 'auto', userPrompt: sc.prompt, carModel: sc.car || 'model_3', model: MODEL, reasoning: REASONING });
      cost += r.meta.estimatedCost;
      const c = sc.check(r.plan, a);
      rows.push({ scenario: sc.name, ok: c.ok ? 'PASS' : 'FAIL', detail: c.detail.slice(0, 90), s: +(r.meta.responseTimeMs / 1000).toFixed(1) });
    } catch (e) {
      rows.push({ scenario: sc.name, ok: 'ERROR', detail: e.message.slice(0, 90), s: 0 });
    }
  }
  console.table(rows);
  console.log(`PASS ${rows.filter((r) => r.ok === 'PASS').length}/${rows.length}  cost ~$${cost.toFixed(4)}  model ${MODEL || process.env.SHOW_DESIGNER_MODEL || 'gpt-5.5 (default)'}`);
})();
