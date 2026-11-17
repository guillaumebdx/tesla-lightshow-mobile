#!/usr/bin/env node
/**
 * Blind comparison of designer models by an LLM judge (paid).
 * For each built-in track, every candidate designs a plan (no user prompt);
 * the judge sees the section map + anonymised plans in random order and
 * scores each one. Two shuffles per track to cancel position bias.
 *
 *   node tests/eval-judge.js --models gpt-5.5:medium,gpt-6-sol:low --judge o3
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { analyzeMusic } = require('../src/services/showEngine/analysis');
const { designShowLLM, userPrompt } = require('../src/services/showEngine/llmDesigner');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const MODELS = arg('models', 'gpt-5.5:medium,gpt-6-sol:low').split(',');
const JUDGE = arg('judge', 'o3');
const FEATURES_DIR = path.join(__dirname, '..', 'src', 'data', 'trackFeatures');
const CACHE = path.join(__dirname, 'output', 'plans');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 180000 });

function planText(plan) {
  return plan.sections.map((s) => `  section ${s.id}: ${s.motif} focus=${s.focus} accent=${s.accent}${s.build ? ' build' : ''}${s.impact ? ' impact' : ''}`).join('\n')
    + `\n  closures: ${JSON.stringify(plan.closures)}`;
}

async function getPlan(spec, track, analysis) {
  const file = path.join(CACHE, spec.replace(':', '_'), `${track.id}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const [model, reasoning] = spec.split(':');
  const r = await designShowLLM(analysis, { trackTitle: track.title, mood: 'auto', carModel: 'model_3', model, reasoning: reasoning || undefined });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(r.plan));
  return r.plan;
}

async function judge(analysis, track, plans) {
  const letters = plans.map((_, i) => String.fromCharCode(65 + i));
  const content = `You judge Tesla light show designs. A renderer plays each design exactly on the beat; you only judge the artistic choices.

Motif energy: calm = breathe, glow, onsets_soft, hold; medium = pulse, ping_pong, front_back, wave, onsets; high = drive, chase, pulse_all, strobe; blackout = all off.
Criteria: follows the music's energy curve; repeated material (same label) treated consistently; contrast between different sections; a satisfying dramatic arc (builds, impacts, peak, ending); sensible closure moments; variety without randomness.

${userPrompt(analysis, { trackTitle: track.title, mood: 'auto', carModel: 'model_3' })}

${plans.map((p, i) => `DESIGN ${letters[i]}:\n${planText(p)}`).join('\n\n')}

Score every design from 1 to 10. Answer JSON only: {"scores": {"A": n, ...}, "why": "one short sentence"}`;
  const r = await client.chat.completions.create({
    model: JUDGE,
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
    ...(/^(o\d|gpt-5|gpt-6)/.test(JUDGE) ? { reasoning_effort: 'medium' } : { temperature: 0 }),
  });
  return JSON.parse(r.choices[0].message.content);
}

(async () => {
  const totals = Object.fromEntries(MODELS.map((m) => [m, []]));
  for (const f of fs.readdirSync(FEATURES_DIR).filter((x) => x.endsWith('.json'))) {
    const track = JSON.parse(fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8'));
    const analysis = analyzeMusic({ features: track.features, durationMs: track.durationMs });
    const plans = await Promise.all(MODELS.map((m) => getPlan(m, track, analysis)));
    for (let shuffle = 0; shuffle < 2; shuffle++) {
      const order = MODELS.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      try {
        const res = await judge(analysis, track, order.map((i) => plans[i]));
        order.forEach((mi, pos) => {
          const score = res.scores[String.fromCharCode(65 + pos)];
          if (typeof score === 'number') totals[MODELS[mi]].push(score);
        });
        console.log(track.id.padEnd(20), order.map((mi, pos) => `${MODELS[mi]}=${res.scores[String.fromCharCode(65 + pos)]}`).join('  '), '|', (res.why || '').slice(0, 120));
      } catch (e) {
        console.log(track.id, 'judge error', e.message.slice(0, 120));
      }
    }
  }
  console.log('\nMEAN SCORES');
  for (const [m, s] of Object.entries(totals)) console.log(`  ${m.padEnd(18)} ${(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)).toFixed(2)}  (n=${s.length})`);
})();
