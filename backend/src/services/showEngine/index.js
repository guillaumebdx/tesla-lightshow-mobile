/**
 * Light show engine v2.
 *
 *   audio features (or legacy waveform)
 *     → analysis.js     tempo, beats, bars, sections, moments (deterministic)
 *     → designer        WHAT happens per section (LLM, rule-based fallback)
 *     → renderer.js     WHEN, from the beat grid only + car constraints
 *     → events (same format as before, so every app version can load them)
 */

const fs = require('fs');
const path = require('path');
const { analyzeMusic, isValidFeatures } = require('./analysis');
const { renderShow } = require('./renderer');
const { designShowRules } = require('./ruleDesigner');

const isDev = process.env.NODE_ENV === 'development';
const log = (msg) => isDev && console.log(`  [ShowEngine] ${msg}`);

// ─── Built-in tracks: precomputed features (scripts/generate_track_features.mjs) ───
const TRACK_DIR = path.join(__dirname, '..', '..', 'data', 'trackFeatures');
let builtinTracks = null;
function loadBuiltinTracks() {
  if (builtinTracks) return builtinTracks;
  builtinTracks = [];
  try {
    for (const f of fs.readdirSync(TRACK_DIR).filter((x) => x.endsWith('.json'))) {
      builtinTracks.push(JSON.parse(fs.readFileSync(path.join(TRACK_DIR, f), 'utf8')));
    }
  } catch (e) {
    console.error('[ShowEngine] Could not load built-in track features:', e.message);
  }
  return builtinTracks;
}

// Old app versions only send the title + duration of built-in tracks.
function findBuiltinTrack({ trackId, trackTitle, durationMs }) {
  const tracks = loadBuiltinTracks();
  if (trackId) {
    const byId = tracks.find((t) => t.id === trackId);
    if (byId) return byId;
  }
  return tracks.find((t) => t.title === trackTitle && Math.abs(t.durationMs - durationMs) < 1500) || null;
}

function summarizeAnalysis(a) {
  return {
    source: a.source,
    bpm: a.tempo.bpm,
    meter: a.meter,
    beats: a.beats.length,
    bars: a.bars.length,
    sections: a.segments.length,
    sectionTypes: a.segments.map((s) => `${s.label}${Math.round(s.level * 9)}`).join(','),
    impacts: a.moments.filter((m) => m.type === 'impact').length,
    onsets: a.onsets.length,
  };
}

async function generateShowV2({ features, waveform, durationMs, trackTitle, trackId, mood, userPrompt, carModel = 'model_3', designer, designerModel, designerReasoning }) {
  const t0 = Date.now();
  // Features must cover the track: a decode that stopped early (corrupt MP3 frame)
  // or garbage base64 would cut the show short, so fall back to the waveform instead.
  const coversTrack = (f) => {
    if (!isValidFeatures(f)) return false;
    const frames = Math.floor((f.onset.length * 3) / 4);
    return frames * f.hopMs >= 0.9 * durationMs;
  };
  let usedFeatures = coversTrack(features) ? features : null;
  let featureSource = usedFeatures ? 'client' : null;
  if (!usedFeatures) {
    const builtin = findBuiltinTrack({ trackId, trackTitle, durationMs });
    if (builtin) {
      usedFeatures = builtin.features;
      featureSource = `builtin:${builtin.id}`;
    }
  }
  const analysis = analyzeMusic({ features: usedFeatures, waveform, durationMs });
  const summary = summarizeAnalysis(analysis);
  log(`Analysis (${featureSource || 'waveform'}) in ${Date.now() - t0}ms: ${summary.bpm} BPM ${summary.meter}/4, ${summary.beats} beats, sections ${summary.sectionTypes}`);

  const which = designer || process.env.SHOW_DESIGNER || 'llm';
  let plan;
  let llmMeta = null;
  if (which === 'llm') {
    try {
      const { designShowLLM } = require('./llmDesigner');
      const r = await designShowLLM(analysis, { trackTitle, mood, userPrompt, carModel, model: designerModel, reasoning: designerReasoning });
      plan = r.plan;
      llmMeta = r.meta;
    } catch (e) {
      console.error('[ShowEngine] LLM designer failed, using rule-based plan:', e.message);
      plan = designShowRules(analysis, { carModel });
      llmMeta = { error: e.message };
    }
  } else {
    plan = designShowRules(analysis, { carModel });
  }

  const { events, closuresUsed, moments } = renderShow(plan, analysis, carModel);
  const partCounts = {};
  events.forEach((e) => { partCounts[e.part] = (partCounts[e.part] || 0) + 1; });
  const maxEnd = events.length ? Math.max(...events.map((e) => e.endMs)) : 0;
  log(`Rendered ${events.length} events in ${Date.now() - t0}ms total, moments: ${moments.map((m) => `${m.type}@${(m.t / 1000).toFixed(1)}s=${m.fx}`).join(' ') || 'none'}`);

  return {
    events,
    plan,
    analysis: summary,
    moments,
    fullAnalysis: analysis,
    meta: {
      engine: 'v2',
      designer: plan.concept === 'rule-based' ? 'rules' : 'llm',
      featureSource: featureSource || 'waveform',
      model: llmMeta?.model || 'none',
      promptTokens: llmMeta?.promptTokens || 0,
      completionTokens: llmMeta?.completionTokens || 0,
      totalTokens: llmMeta?.totalTokens || 0,
      estimatedCost: llmMeta?.estimatedCost || 0,
      eventsCount: events.length,
      eventsRemoved: 0,
      choreographyPlacements: plan.sections.length,
      coveragePercent: durationMs ? +((maxEnd / durationMs) * 100).toFixed(1) : 0,
      // Shown in the admin dashboard: LLM outcome + which audio input was used.
      finishReason: `${llmMeta?.finishReason || (llmMeta?.error ? `fallback: ${llmMeta.error}`.slice(0, 150) : 'rules')} · ${featureSource || 'waveform'}`,
      responseTimeMs: Date.now() - t0,
      beatsDetected: summary.beats,
      strongBeats: analysis.beats.filter((b) => b.downbeat).length,
      estimatedBPM: Math.round(summary.bpm),
      // Admin dashboard columns, reused for the song-specific moments.
      peaksDetected: moments.filter((m) => m.fx === 'explosion').length,
      dropsDetected: analysis.highlights.drops.length,
      risesDetected: analysis.highlights.risers.length,
      sectionsDetected: summary.sections,
      sectionTypes: summary.sectionTypes,
      segmentCoverage: summary.sectionTypes,
      partBreakdown: JSON.stringify(partCounts),
      closuresUsed,
    },
  };
}

module.exports = { generateShowV2, findBuiltinTrack };
