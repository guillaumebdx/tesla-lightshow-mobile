---
name: ai-show-generation
description: Backend AI light show generation (OpenAI) — system prompt, pattern library, choreography expansion, per-car addenda, event validation, cost, and the generation test harness. Use when changing backend/src/systemPrompt.js, backend/src/services/patterns.js, backend/src/services/llmService.js or backend/src/routes/generateShow.js, when tuning the quality of generated shows, or when a generated show has wrong/missing parts.
---

# AI show generation

## Pipeline

```
mobile aiService.js --(waveform, durationMs, mood, trackTitle, userPrompt, carModel, App Check token)-->
POST /api/generate-show  (routes/generateShow.js: App Check, rate limit, carModel coerced to model_3 | model_y_juniper)
  -> llmService.generateLightShow()
       system prompt = systemPrompt.js with {PATTERN_CATALOG} = patterns.getPatternCatalog(carModel)
                       + JUNIPER_ADDENDUM when carModel === 'model_y_juniper'
       LLM returns a *choreography* (pattern names + timestamps), not raw events
  -> patterns.expandChoreography(plan, durationMs, carModel)  => concrete events
  -> event filter (VALID_PARTS, timestamps)  => response + row in `generations` table (tokens, cost)
```

The LLM only picks patterns. The patterns themselves are deterministic code in `patterns.js`. Fix a bad *shape* in the pattern code, and a bad *choice* in the prompt.

## Compatibility constraint

The backend is deployed independently, and users run old app versions. Any change to the response shape, part IDs or effect names must stay readable by older apps. Check git history for "retrocomp" for precedent (`git log --oneline --grep retrocomp`, commit 39dad84).

## Test before deploying

```bash
cd backend
node tests/test-generation.js --runs 1                 # quick smoke test (real OpenAI call, costs money)
node tests/test-generation.js --runs 3 --judge         # + LLM-as-judge quality score
node tests/test-generation.js --prompt "chill, slow fades"
```

- Needs `OPENAI_API_KEY` in `backend/.env`. It calls `generateLightShow` directly, so no server is needed.
- 12 deterministic checks (coverage, distribution, variety, closure limits, valid parts, monotony). See `backend/tests/README.md`.
- **Gap:** the harness always generates for `model_3`. Juniper output is not covered. Pass `carModel: 'model_y_juniper'` in the script when working on Juniper patterns.
- Ask before running more than a couple of runs: each run is a paid API call.

## Rules

- Closure limits in patterns must respect the `tesla-closures` skill. The AI stays below the app limits on purpose.
- A new part must be in `VALID_PARTS` (`llmService.js`), or its events are silently dropped. See `add-vehicle-part`.
- The model name comes from `OPENAI_MODEL` in `.env`. Never hardcode it or the key.
- `logBroadcaster` intercepts `console.log` / `console.error` and streams them live to the admin dashboard. Keep the `[Tag]` prefix style. The `log()` helper in `llmService.js` only prints when `isDev`.
