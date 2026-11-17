---
name: ai-show-generation
description: Backend AI light show generation — engine v2 (music analysis, beat-locked motifs, LLM designer, renderer), audio features sent by the app, the built-in track features, evaluation scripts and metrics, and the v1 rollback. Use when changing anything in backend/src/services/showEngine/, backend/src/routes/generateShow.js, src/audioFeatures.js, src/waveformGenerator.js or the AI call in src/aiService.js / ModelViewer.js, when tuning the quality of generated shows, or when users report shows that are random, out of sync, dark or wrong.
---

# AI show generation (engine v2)

Users complained that AI shows were "random and not synced to the music". Measured on the 8 built-in tracks, the v1 generator was **no better than chance**: 58% of light attacks on the beat/onset grid vs 59% for randomly shifted attacks, 97% of on/off runs shorter than 100 ms (blink flicker), 31% dark time. v2 was rebuilt from scratch around one rule: **the LLM never chooses a timestamp**.

## Pipeline

```
app ──(waveform 2000 RMS bars, durationMs, trackTitle, carModel, userPrompt,
       NEW optional: trackId (built-in) | audioFeatures (imported, computed on device))──▶
POST /api/generate-show (routes/generateShow.js — SHOW_ENGINE=v1 switches back to llmServiceV1)
  └─ showEngine/index.js  generateShowV2()
       1. features: client audioFeatures → else built-in track (trackId, or title+duration for old apps:
          src/data/trackFeatures/*.json) → else legacy waveform
       2. analysis.js     onset envelope → tempo (autocorrelation + prior) → beats (Ellis DP)
                          → meter + downbeats → bars → sections (novelty on bar SSM, 4-bar phrase grid)
                          → repetition labels (A/B/C), energy level per section, onsets, moments
       3. highlights.js   song-specific: intro (music arrives), drops, stops, hits, risers, climax,
                          and each section's groove (16th-slot attack pattern per band low/mid/high)
       4. llmDesigner.js  section table (+ groove line) and moment table → strict JSON schema plan:
                          per section {motif, focus, accent, build, impact, bars, interior},
                          per moment {fx: explosion | flash | blackout_flash | none}, closures, ending
                          (fallback on any error/timeout: ruleDesigner.js, deterministic)
       5. renderer.js     motifs.js turns each section into hits on beats / 8ths / 16ths / snapped onsets
                          → moment effects (breath of darkness + explosion, flashes, blackouts, riser builds)
                          → roles mapped to car parts → per-part min 100 ms on / 100 ms off
                          → dark-gap fill → closures (mirrors fold on drops) → events (same format as v1)
```

## Invariants

- Every light attack is on the beat grid (beat, 8th, 16th) or on a detected onset snapped to the 16th grid. Add a motif → keep that property and check `tests/eval-show.js` inSync.
- No `blink` effect (it is a fixed 30-80 ms flicker unrelated to tempo). No `pulse` effect (fixed period). Rhythm comes from solid hits. Easing only on dimmable parts (Juniper bars, interior).
- Most car lights are on/off (> 50% = on), need ≥ 100 ms on and ≥ 100 ms off: `normalizePart()` enforces it per part.
- Response shape is unchanged (`{ events }`, same event fields): old apps keep working. The `< 1.15` legacy part mapping in the route still applies.
- Closures follow the `tesla-closures` skill: mirrors roundtrip ≤ 6 (12 of 20 commands), windows ≤ 2 dances and ~28 s total (thermal), trunk open 13 s before its dance section then dance ≤ 15 s then close, flap open → rainbow → close (3 = limit).
- Juniper: roles map to Juniper parts in `CAR_PROFILES`; `sig` = front light bar; bars/interior layers only on Juniper.

## "Made for this song" layer

- **Moments** (`highlights.js` → `listMoments`): `intro` (first attack once the level reaches the song's body), `drop` (beat-level loudness jump ≥ 4.5 dB vs the previous 4 or 2 beats or a short dip, snapped to a stronger pickup attack just before the beat), `stop` (≥ 12 dB under the previous 2 s for 0.25-3 s, return = strongest attack after), `hit` (onset ≥ 2.5x its ±3 s context). Big drops (≥ 8 dB) are all kept, small ones ~1 per 25 s.
- **Effects** (`renderer.js` → `applyMoments`): `explosion` = darkness during the preceding stop or a one-beat breath, then one bar: whole car → left/right strobe on 16ths (8ths if too fast) → tail afterglow; Juniper bars full + white cabin flash. Max one explosion per 12 s (enforced in renderer whatever the plan says). `flash` = 120 ms dip then whole car on the attack. A riser before an exploding drop gets an automatic accelerating build (never over the previous effect).
- **Groove motifs**: `groove` replays the section's strongest 16th slots (only in bars that really play them), each on its instrument's lights: low → rear, mid → headlights, high → blinkers L/R; `drumkit` follows every real attack by band. Both hold legato (dip before each hit) to avoid a dark car. On the legacy waveform path there is no band split: `groove` uses the main lights, `drumkit` falls back to `onsets`.
- Detections were checked by plotting loudness with the moments on top: do the same (plot `analysis._signals.loudness`) after changing a threshold — the metrics alone can hide a moment placed on the wrong side of a dip.

## Audio features (src/audioFeatures.js, shared app/backend format v1)

Mel spectral flux (512-pt FFT on ~22 kHz audio, hop 256 ≈ 11.6 ms, 40 mel bands) → `onset`, `lowOnset` (< 200 Hz), plus `low/mid/high` band energies in dB, each 0-255 base64 (onsets square-root companded). ~30 KB per minute.
- Built-in tracks: `node scripts/generate_track_features.mjs` → `backend/src/data/trackFeatures/<id>.json`. **Rerun it when a built-in MP3 is added or replaced** (and add its librosa reference, below).
- Imported tracks: computed at import from the same decode as the waveform (`waveformGenerator.js`), cached as `<file>.features.json`; computed lazily at AI time for tracks imported before (`loadOrComputeAudioFeatures`). Uses the MP3's real sample rate (48 kHz files had a wrong duration before).
- The extractor is ~1% of the js-mp3 decode time. It runs on device: only a real device tells the actual wait on a long track.

## Designer model

Default `SHOW_DESIGNER_MODEL=gpt-5.5`, `SHOW_DESIGNER_REASONING=medium` (35-70 s, ~$0.06 per show), `SHOW_DESIGNER_TIMEOUT_MS` 120000 per attempt with 1 automatic retry; the rule-based plan is only used if both attempts fail (OpenAI down). `low` (5-20 s, ~$0.025) keeps the same sync/moment/groove scores with slightly weaker structure (coherence 0.88 vs 0.94, contrast 0.79 vs 0.96).

**Keep-alive (routes/generateShow.js `startKeepAlive`)**: released iOS apps abort a request after 60 s without receiving data (React Native 0.81 sets `timeoutInterval` 0 → NSURLSession default 60 s idle timer, reset on every byte; Android/OkHttp has no timeout). The route sends the 200 headers immediately with `X-Accel-Buffering: no` (nginx must not buffer), writes a space every 10 s, then the JSON (leading whitespace is valid JSON). After that point errors are returned as `{ error }` with status 200 — every app version shows its usual error alert. Validation errors (400) happen before and keep their status. Check a proxy streams correctly with `curl -N https://<host>/health/stream` (one line per second). Tested: a 68 s generation succeeds against a client that aborts after 15 s of silence.

Interior `sync` mode is never emitted (the app's export re-scans every light event per frame for it — slow on Juniper phones); same-part overlapping events are never emitted (the 3D preview shows only one of them). Chosen by `eval-judge.js` (blind o3 judge: gpt-5.5/medium 7.31, gpt-6-sol/low 7.00, gpt-5.4-mini/low 6.63, gpt-4.1-mini 6.38) and `eval-prompts.js` (7/7 user requests followed; gpt-4.1-mini failed "chill"). `SHOW_DESIGNER=rules` skips the LLM entirely. `OPENAI_MODEL` is only used by v1.

## Evaluate before deploying (backend/)

| Command | Cost | What it tells |
|---|---|---|
| `node tests/eval-analysis.js [--verbose]` | free | beat F-measure vs librosa references, tempo, sections — features and legacy waveform paths |
| `node tests/eval-show.js` | free | rule-designer shows on 8 tracks: inSync vs chance, beatHit, darkPct, energyCorr, flicker, plan metrics, **app-rule violations** (`validateEvents.js`) |
| `node tests/eval-show.js --designer llm [--car model_y_juniper] [--source waveform] [--model m --reasoning r]` | ~$0.3 | same with the LLM designer. `--source waveform` simulates an old app with an imported track |
| `node tests/eval-show.js --old` | ~$0.05 | v1 baseline (cached in tests/output/old) |
| `node tests/eval-prompts.js [--model m --reasoning r]` | ~$0.35 | 7 user requests with deterministic pass/fail checks |
| `node tests/eval-judge.js --models a:low,b:medium --judge o3` | ~$2 | blind plan ranking between designer models |

Targets reached at release: features path beat F 0.94 (exact 0.90); shows inSync ≈ 0.97 (chance ≈ 0.53), 0% flicker, ~16% dark (v1: 31%), 0 app-rule violations on both cars. Legacy waveform path (old app + imported track): inSync 0.89, beatHit 0.62 (half-tempo errors — the 2000-bar waveform cannot resolve them; the new app version fixes it by sending features).

Song-specific metrics in `eval-show.js`: `momentHit` (share of librosa "big moments" — loudness jumps ≥ 8 dB, snapped to onsets — where ≥ 40% of the lights switch on within ±80 ms and the car goes from low to ≥ 60% lit), `momentImpact` (lit share just after minus the second before), `grooveFid` (cosine between the 16th-slot rhythm of light attacks and of librosa onsets, per section). v1: momentHit 0.23, grooveFid 0.72; v2 rule designer with effects: ~0.70 / ~0.77; all-`groove` sections reach grooveFid 0.86.

Reference beats: `tests/fixtures/reference-beats/*.json` from librosa (`tests/tools/ref_beats.py`, needs a Python venv with librosa). librosa beats are ~25 ms late (measured on a synthetic click track; ours are ~4 ms early) — `showMetrics.js` compensates.

## Where to change what

- Show feels off-beat → analysis (`eval-analysis.js` first), never the LLM prompt.
- A motif looks wrong → `motifs.js` (timing/shape), then `eval-show.js` + per-motif check.
- Wrong artistic choices (energy, coherence, user request ignored) → `llmDesigner.js` prompt, then `eval-prompts.js`.
- Too dark / too busy → renderer fill, motif lengths, or the designer prompt; watch `darkPct` and `energyCorr`.
- New part → `CAR_PROFILES` + role groups in `motifs.js` (and the `add-vehicle-part` checklist).

## v1 (rollback)

`llmServiceV1.js` + `systemPrompt.js` + `patterns.js` (LLM picks patterns with timestamps). Selected with `SHOW_ENGINE=v1`. Its harness: `tests/test-generation.js`. Remove once v2 has been in production long enough.
