/**
 * LLM show designer: reads the section map of the song and decides, per
 * section, which beat-locked motif to use and how to dress it. It never
 * outputs timestamps — the renderer places everything on the beat grid.
 */

const OpenAI = require('openai');
const { MOTIF_NAMES, ACCENT_NAMES, MOTIF_ENERGY } = require('./motifs');
const { designShowRules } = require('./ruleDesigner');
const { findHighlights, grooveText, listMoments } = require('./highlights');

// gpt-5.5 won the blind comparison (tests/eval-judge.js) and follows user requests (tests/eval-prompts.js).
// Reasoning "low" (5-20 s) by default: released iOS apps give up on a request after
// 60 s without data (NSURLSession default, no timeout set by the app), and "medium"
// takes 35-60 s with the groove/moment tables.
const MODEL = process.env.SHOW_DESIGNER_MODEL || 'gpt-5.5';
const REASONING = process.env.SHOW_DESIGNER_REASONING || 'low';
// Hard ceiling for the LLM call, no retry: past it the rule-based plan is used, so the
// whole request always answers well under the iOS 60 s limit.
const TIMEOUT_MS = Math.min(45000, parseInt(process.env.SHOW_DESIGNER_TIMEOUT_MS, 10) || 30000);

// USD per million tokens (input, output). Unknown models are logged with the default.
const PRICING = {
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2, 8],
  'gpt-5-mini': [0.25, 2],
  'gpt-5': [1.25, 10],
  // Third-party price lists (Nov 2026), to be confirmed on openai.com/api/pricing
  'gpt-5.4-mini': [0.75, 4.5],
  'gpt-5.5': [5, 30],
  'gpt-6-sol': [2, 10],
  'o3': [2, 8],
};
const DEFAULT_PRICING = [1.25, 10];

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

const isReasoningModel = (m) => /^(gpt-5|gpt-6|o\d)/.test(m);

const MOTIF_DOC = `
CALM (energy 1)
- breathe: signatures and tail lights take turns, one per bar, held. Very soft.
- glow: signatures + tails steady, headlights touch each downbeat. Elegant, static.
- onsets_soft: soft lights follow the notes/attacks of the music (great for piano, ballads, free tempo).
- hold: main lights steady for the whole section (big sustained chords, a final note).
MEDIUM (energy 2)
- pulse: main lights on every beat (every other beat if the tempo is fast). Clear and simple.
- ping_pong: left side on one beat, right side on the next. Groovy.
- front_back: front on beats 1 and 3, rear on 2 and 4 (kick / snare feel).
- wave: a sweep from the front to the back of the car on each beat (or each bar if fast).
- onsets: the whole car follows the attacks of the music (good for irregular rhythms, orchestral hits).
- groove: plays THIS section's own rhythm pattern (see its groove line), each hit on the lights of the instrument playing it (kick/bass -> rear, snare/voice -> headlights, hats -> blinkers). The most "made for this song" motif: use it a lot in medium and high sections with a clear groove.
- drumkit: a visual drum kit following every real attack (kick -> rear, snare -> headlights, hats -> blinkers left/right). Great for drum-driven sections, fills and solos.
HIGH (energy 3)
- drive: main lights every beat, blinkers on the off-beats, full car on each downbeat. Powerful groove.
- chase: one light runs around the car in 8th notes, direction flips every phrase. Busy, exciting.
- pulse_all: every light on every beat. Massive.
- strobe: whole car in 8th notes. Use only for the most intense moments (short climaxes, final chorus).
SPECIAL
- blackout: all off. Only for real breaks/silences or a dramatic pause right before a drop.`;

const ACCENT_DOC = `
- none
- downbeats: full car flash on the first beat of every bar (adds punch).
- backbeat: brake light + plate on beats 2 and 4 (adds groove).
- offbeats: blinkers + side repeaters on the "and" between beats (adds drive, fast feel).
- hits: whole car on the strongest attacks of the section (for orchestral stabs, accents).`;

function systemPrompt(carModel) {
  const juniper = carModel === 'model_y_juniper';
  return `You are the lighting designer of a Tesla light show. The music has already been analysed: you get its sections (with repetition labels and energy levels). A renderer places every light exactly on the beats — you only choose WHAT happens in each section. Your goal: a show that feels tightly synced, musical and coherent from the first to the last second, with a clear dramatic arc.

# MOTIFS (one per section, all beat-locked)
${MOTIF_DOC}

# ACCENTS (optional layer on top of the motif)
${ACCENT_DOC}

# OTHER CONTROLS PER SECTION
- focus: "whole" (default), "front" (only the front of the car plays the motif) or "rear" (only the back). Accents and impacts always use the whole car. Use it for contrast on SHORT sections (up to ~16 bars, e.g. a verse on the front only before a whole-car chorus) or when the user asks for specific lights. Long sections should use the whole car.
- build: true → the last 1-2 bars of this section accelerate (quarter → 8th → 16th notes) into the next section. Use it before a big energy jump.
- impact: true → whole car flash on the first beat of this section. Use it where the music hits hard (drops, chorus starts, after a build).
${juniper ? `- bars (Model Y center light bars, dimmable): "beat" = flash with decay on every beat, "swell" = slow fade in/out per bar, "off".
- interior (5 RGB LEDs in the cabin): { mode: "color" (steady), "pulse" (color flash on each downbeat), "rainbow" (cycling hues), "off", color: "#RRGGBB" }. Pick colors that fit the mood and keep them consistent per section label. Keep the cabin lit most of the time.` : '- bars and interior: Model Y only. For this car always use bars "off" and interior { mode: "off", color: "#000000" }.'}

# MOMENTS (song-specific highlights, detected in the audio)
You get the list of the song's big moments with a suggested effect. For each one choose:
- explosion: darkness right before, then the whole car blasts on the beat, left/right strobe, afterglow (one bar). The signature effect: keep it for the biggest moments (the music arriving, a drop after a break, the start of the final chorus). The renderer allows at most one per 12 s.
- flash: whole car flash exactly on the attack. For smaller drops and orchestral hits.
- blackout_flash: total darkness during a silence, flash when the music returns.
- none: ignore it (e.g. a user who wants something soft).
These moments are what makes the audience feel the show was made for THIS song: use them, unless the user asks for something calm.

# CLOSURES (moving parts — hardware limits, the renderer enforces them)
- mirrors: list of section ids (max 6) where the mirrors fold and unfold. High-energy sections. If the section contains a drop, the mirrors fold exactly on it.
- windows: list of section ids (max 2) where the windows dance. The biggest choruses.
- trunk: one section id or null. The trunk opens 13 s BEFORE that section and dances during it. Choose a big section starting after at least 15 s.
- flap: one section id or null. The charge port opens and its LED does a rainbow. A special moment (bridge, key change, a long section).
Use closures only on tracks longer than ~45 s.

# DESIGN PRINCIPLES
1. Follow the energy: each section comes with an energy tier (CALM / MEDIUM / HIGH) measured from the audio. Pick a motif FROM THAT TIER. You may go one tier up only for the last occurrence of a chorus or the very peak of the song, and one tier down for a deliberate contrast — never more. A HIGH section with a calm motif, or a CALM section with a high one, feels out of sync to the audience.
2. Coherence: sections with the same label are the same musical material — give them the same motif (you may add an accent or switch to a stronger motif of the same family when it comes back louder near the end).
3. Contrast: adjacent sections with different labels should look different.
4. Arc: keep the most intense motifs (strobe, pulse_all) for the peak sections; save something for the last big chorus.
5. Builds and impacts: put build=true on a section followed by a big energy jump, and impact=true on the section it lands on.
6. The user's creative direction (if any) overrides these defaults — follow it closely:
   - soft / chill / calm / elegant → shift every tier DOWN one step (HIGH sections get MEDIUM motifs, MEDIUM and CALM sections get CALM motifs), no strobe or pulse_all at all;
   - intense / party / strobes / maximum → shift every tier UP one step and use strobe or pulse_all on the loudest sections;
   - specific lights ("only the rear", "headlights only") → use focus accordingly on every section;
   - "no moving parts" → no closures at all; a specific closure request → include it.
   The music still decides WHERE the energy rises and falls; the user decides how far it goes.
7. Never leave the car dark except on purpose (blackout) for a real break. onsets_soft is sparse: prefer breathe or glow for long quiet sections.

Answer with the JSON object only.`;
}

function ensureHighlights(analysis) {
  if (!analysis.highlights) analysis.highlights = findHighlights(analysis);
  return analysis.highlights;
}

function momentTable(analysis) {
  const moments = listMoments(ensureHighlights(analysis));
  if (!moments.length) return 'none detected';
  const segOf = (t) => analysis.segments.find((s) => t >= s.t0 && t < s.t1);
  return moments.map((m) => {
    const what = m.type === 'drop' ? `drop +${m.strength} dB${m.afterStop ? ' after a silence' : ''}`
      : m.type === 'stop' ? `silence ${((m.t1 - m.t) / 1000).toFixed(1)} s then the music returns`
        : m.type === 'intro' ? 'the music arrives (start of the song)' : `isolated hit x${m.strength}`;
    return `${m.id} | ${(m.t / 1000).toFixed(2)}s | section ${segOf(m.t)?.id ?? '-'} | ${what} | suggested ${m.fx}`;
  }).join('\n');
}

function sectionTable(analysis) {
  const impacts = new Set(analysis.moments.filter((m) => m.type === 'impact').map((m) => m.segment));
  const breaks = new Set(analysis.moments.filter((m) => m.type === 'break').map((m) => m.segment));
  return analysis.segments.map((s) => {
    const flags = [];
    if (s.id === 0) flags.push('first');
    if (s.id === analysis.segments.length - 1) flags.push('last');
    if (impacts.has(s.id)) flags.push('energy jump at start');
    if (breaks.has(s.id)) flags.push('break');
    const tier = s.level < 0.3 ? 'CALM' : s.level < 0.65 ? 'MEDIUM' : 'HIGH';
    const g = ensureHighlights(analysis).grooves.get(s.id);
    if (g) flags.push(`groove ${grooveText(g, analysis.meter)}`);
    const climax = analysis.highlights.climax;
    if (climax && climax.t < s.t1 && climax.t1 > s.t0) flags.push('CLIMAX of the song');
    return `${s.id} | ${(s.t0 / 1000).toFixed(1)}-${(s.t1 / 1000).toFixed(1)}s | ${s.barEnd - s.barStart} bars | label ${s.label} | level ${s.level.toFixed(2)} → ${tier} | ${s.trend} | rhythmic density ${s.relDensity.toFixed(2)}${flags.length ? ` | ${flags.join(', ')}` : ''}`;
  }).join('\n');
}

function userPrompt(analysis, { trackTitle, mood, userPrompt: direction, carModel }) {
  const durS = (analysis.durationMs / 1000).toFixed(0);
  return `Track: "${trackTitle || 'Unknown'}", ${durS} s, ${analysis.tempo.bpm} BPM, ${analysis.meter}/4. Mood hint: ${mood || 'auto'}. Car: ${carModel === 'model_y_juniper' ? 'Model Y Juniper (has center light bars + interior RGB)' : 'Model 3 / Model Y (no light bars, no interior)'}.
${direction ? `\nUSER'S CREATIVE DIRECTION (follow it, see principle 6 — it can shift the energy tiers):\n${direction}\n` : ''}
SECTIONS (id | time | length | repetition label | energy level 0-1 → tier | trend | rhythmic density 0-1 | notes):
${sectionTable(analysis)}
(groove = the section's rhythm on 16th notes, one bar: X strong, x medium, . nothing, | between beats)

MOMENTS (id | time | section | what | suggested effect):
${momentTable(analysis)}

Design the show: one entry per section id, in order, and one effect per moment id.`;
}

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['concept', 'sections', 'closures', 'ending', 'moments'],
    properties: {
      concept: { type: 'string', description: 'One sentence describing the show idea.' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'motif', 'focus', 'accent', 'build', 'impact', 'bars', 'interior'],
          properties: {
            id: { type: 'integer' },
            motif: { type: 'string', enum: MOTIF_NAMES },
            focus: { type: 'string', enum: ['whole', 'front', 'rear'] },
            accent: { type: 'string', enum: ACCENT_NAMES },
            build: { type: 'boolean' },
            impact: { type: 'boolean' },
            bars: { type: 'string', enum: ['off', 'beat', 'swell'] },
            interior: {
              type: 'object',
              additionalProperties: false,
              required: ['mode', 'color'],
              properties: {
                mode: { type: 'string', enum: ['off', 'color', 'pulse', 'rainbow'] },
                color: { type: 'string' },
              },
            },
          },
        },
      },
      closures: {
        type: 'object',
        additionalProperties: false,
        required: ['mirrors', 'windows', 'trunk', 'flap'],
        properties: {
          mirrors: { type: 'array', items: { type: 'integer' } },
          windows: { type: 'array', items: { type: 'integer' } },
          trunk: { type: ['integer', 'null'] },
          flap: { type: ['integer', 'null'] },
        },
      },
      ending: { type: 'string', enum: ['flash', 'none'] },
      moments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'fx'],
          properties: {
            id: { type: 'integer' },
            fx: { type: 'string', enum: ['explosion', 'flash', 'blackout_flash', 'none'] },
          },
        },
      },
    },
  };
}

// Fill gaps / fix anything the model got wrong, using the rule plan as default.
function sanitizePlan(raw, analysis, carModel) {
  const fallback = designShowRules(analysis, { carModel });
  const ids = new Set(analysis.segments.map((s) => s.id));
  const byId = new Map((raw.sections || []).filter((s) => ids.has(s.id)).map((s) => [s.id, s]));
  const sections = fallback.sections.map((fb) => {
    const s = byId.get(fb.id);
    if (!s) return fb;
    return {
      id: fb.id,
      motif: MOTIF_NAMES.includes(s.motif) ? s.motif : fb.motif,
      focus: ['whole', 'front', 'rear'].includes(s.focus) ? s.focus : 'whole',
      accent: ACCENT_NAMES.includes(s.accent) ? s.accent : 'none',
      build: !!s.build,
      impact: !!s.impact,
      bars: ['off', 'beat', 'swell'].includes(s.bars) ? s.bars : fb.bars,
      // "sync" is never sent: it makes the app's FSEQ export re-scan every light event on every
      // frame (slow on Juniper phones with thousands of events). A downbeat pulse reads the same.
      interior: s.interior && ['off', 'color', 'pulse', 'rainbow'].includes(s.interior.mode) ? s.interior
        : s.interior && s.interior.mode === 'sync' ? { mode: 'pulse', color: s.interior.color || '#ffffff' } : fb.interior,
    };
  });
  const c = raw.closures || {};
  const validId = (x) => (Number.isInteger(x) && ids.has(x) ? x : null);
  return {
    concept: typeof raw.concept === 'string' ? raw.concept.slice(0, 300) : '',
    sections,
    closures: {
      mirrors: (Array.isArray(c.mirrors) ? c.mirrors : []).map(validId).filter((x) => x !== null).slice(0, 6),
      windows: (Array.isArray(c.windows) ? c.windows : []).map(validId).filter((x) => x !== null).slice(0, 2),
      trunk: validId(c.trunk),
      flap: validId(c.flap),
    },
    ending: raw.ending === 'none' ? 'none' : 'flash',
    moments: (Array.isArray(raw.moments) ? raw.moments : [])
      .filter((m) => Number.isInteger(m.id) && ['explosion', 'flash', 'blackout_flash', 'none'].includes(m.fx))
      .map((m) => ({ id: m.id, fx: m.fx })),
  };
}

async function designShowLLM(analysis, ctx) {
  const model = ctx.model || MODEL;
  const t0 = Date.now();
  const params = {
    model,
    messages: [
      { role: 'system', content: systemPrompt(ctx.carModel) },
      { role: 'user', content: userPrompt(analysis, ctx) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'light_show_plan', strict: true, schema: responseSchema() } },
  };
  if (isReasoningModel(model)) {
    params.reasoning_effort = ctx.reasoning || REASONING;
    params.max_completion_tokens = 16000;
  } else {
    params.temperature = 0.8;
    params.max_tokens = 8000;
  }
  const response = await getClient().chat.completions.create(params);
  const choice = response.choices[0];
  const content = choice?.message?.content;
  if (!content) throw new Error(`empty LLM response (${choice?.finish_reason})`);
  const raw = JSON.parse(content);
  const plan = sanitizePlan(raw, analysis, ctx.carModel);
  const usage = response.usage || {};
  const [pin, pout] = PRICING[model] || PRICING[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')] || DEFAULT_PRICING;
  const cost = ((usage.prompt_tokens || 0) * pin + (usage.completion_tokens || 0) * pout) / 1e6;
  return {
    plan,
    meta: {
      model,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
      estimatedCost: cost,
      finishReason: choice.finish_reason,
      responseTimeMs: Date.now() - t0,
    },
  };
}

module.exports = { designShowLLM, sanitizePlan, systemPrompt, userPrompt, MOTIF_ENERGY };
