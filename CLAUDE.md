# LightShow Studio — Project Context for Claude Code

@package.json
@app.json
@backend/package.json
@backend/.env.example

## What is this project?

**LightShow Studio** is a React Native (Expo) mobile app that lets users create custom Tesla Light Shows using a 3D vehicle editor with a music-synced timeline, then export a `.fseq` file that runs on the real car. It includes:

- A **mobile app** (iOS + Android) built with Expo SDK 54 + React Native 0.81. Supported cars: **Model 3** (48-channel FSEQ) and **Model Y Juniper** (200-channel FSEQ: light bars + interior RGB).
- A **Node.js backend** (Express + SQLite) for AI show generation, admin dashboard, chat support, analytics, and votes

Production URL: `https://lightstudio.harari.ovh`
Bundle ID iOS: `com.guillaumebdx.lightstudiofortesla`
Package Android: `com.guillaumebdx.tesla3dviewer`

## Where knowledge lives

- **Skills** (`.claude/skills/`) — domain knowledge and workflows, loaded on demand:
  | Skill | Use it for |
  |---|---|
  | `fseq-export` | `fseqExport.js`, channel maps (48 / 200), light bars, diagnostic FSEQ files |
  | `tesla-closures` | mirrors / windows / trunk / flap: command bytes, per-show limits, durations |
  | `add-vehicle-part` | checklist to add or rename a part across app, export, i18n, AI, demos |
  | `add-car-model` | new vehicle or new GLB: inspection scripts, `carModels.js`, picker, AI, demos |
  | `ai-show-generation` | backend LLM prompt, patterns, expansion, generation test harness |
  | `/release` | user-invoked: version bump, commit + tag, EAS build and submit |
  | `/deploy-backend` | user-invoked: backend deploy checklist for the VPS |
- **Subagents** (`.claude/agents/`) — delegate to them instead of doing it inline:
  | Agent | Model | Use it for |
  |---|---|---|
  | `fseq-guardian` | Opus, read-only | review after any change to export, channels, parts, closures, car models — and before a release |
  | `compat-checker` | Opus, read-only | backward-compat check vs last `vX.Y.Z` tag before `/release` or `/deploy-backend`, or after API/storage/DB changes |
  | `translator` | Sonnet | fill fr/de/es for new or changed en.json keys |
  | `ai-gen-tester` | Sonnet | run the AI generation harness (paid: get the user's OK on the run count first) |
- **Hooks / permissions** (`.claude/settings.json`) — `check-i18n` runs automatically after edits to `src/i18n/*.json`; `eas build/submit`, AI test runs and `git push` always ask.
- **Rules** (`.claude/rules/`) — auto-loaded by path: `mobile.md` (src/), `backend.md` (backend/), `i18n.md`, `api-endpoints.md`.
- **Human docs** (`docs/`) — Firebase setup, website chat integration. `README.md` is the product overview (French).

## Project structure

```
App.js                ← Entry point, state-based nav (home/new/editor)
src/
  ModelViewer.js      ← Main editor: 3D viewer + playback + settings (~3400 lines — grep, then read sections)
  AudioTimeline.js    ← Music timeline, drag/drop events (~1500 lines)
  HomeScreen.js, NewShowScreen.js (car picker + vote CTA), PartOptionsPanel.js, ExportModal.js,
  AiPromptModal.js, SupportChat.js, DemoViewer.js, TutorialOverlay.js, FlashMessage.js
  carModels.js        ← Per-car config: GLB, FSEQ channel count, scale, feature flags
  constants.js        ← Parts, part type sets, effects, closure modes/limits, defaults
  fseqExport.js       ← Binary FSEQ v2 encoder
  storage.js          ← AsyncStorage CRUD for shows
  *Service.js, deviceId.js, apiConfig.js, firebase.js, audioPicker.js, waveformGenerator.js
  i18n/               ← en, fr, de, es
  demoShows/          ← Built-in demo shows (generated) + per-car variants
assets/               ← GLB models, icons, MP3 tracks + waveforms
backend/
  src/index.js        ← Express entry, route mounting, rate limiters
  src/routes/         ← generateShow, chat, analytics, votes, admin, adminChat
  src/services/       ← database (all SQL), llmService, patterns, pushService, logBroadcaster
  src/middleware/     ← appCheck, adminAuth
  public/             ← Admin dashboard (plain HTML/JS)
  tests/              ← AI generation test harness (real OpenAI calls)
scripts/
  check-i18n.mjs      ← i18n key parity + t() usage check
  glb/                ← GLB inspection / texture strip (run from repo root)
  fseq/               ← FSEQ analysis, validation, diagnostic generators, retro-engineering notes
  demo/               ← Demo show generator
  generate_waveforms.mjs
```

## Commands

```bash
# Mobile
npm install
npx expo start
npx expo run:android | npx expo run:ios

# Backend
cd backend && npm install && npm run dev      # dev with --watch, port 3001

# Checks (run from repo root)
node scripts/check-i18n.mjs                     # must pass after any UI text change
node scripts/fseq/validate-export.js            # FSEQ closure logic sanity check (48-ch)
node scripts/fseq/analyze-fseq.js <file.fseq>   # inspect an exported file
cd backend && node tests/test-generation.js --runs 1   # AI generation (paid API call — ask first)
```

There is no automated test suite or linter for the mobile app. Verification means running the checks above and, for UI/3D changes, the app itself. Say so explicitly when something could only be checked by running it on a device.

Releasing and deploying go through `/release` and `/deploy-backend`. Never run `eas build`, `eas submit` or a deploy unprompted.

## Git workflow

- `master` = what is (or will next be) in production. Feature work goes on a branch, merged back before release.
- Every production build is built from a **clean, committed, tagged** tree (`vX.Y.Z`). EAS uploads uncommitted changes too, so a dirty tree makes production untraceable.
- Commit or push only when asked.

## Key technical decisions

### Mobile
- **No navigation library** — simple `useState` screen switching in App.js (`home`/`new`/`editor`)
- **3D rendering** — expo-gl + expo-three + THREE.js with texture-less GLB models
- **State management** — local `useState`/`useRef` only, no Redux/Context
- **Persistence** — AsyncStorage for everything (shows, settings, device ID, analytics queue)
- **Analytics/Votes** — fire-and-forget pattern. NEVER block UI. NEVER throw. Catch all errors silently.
- **i18n** — i18next with 4 locales: en, fr, de, es. All keys must exist in all 4 files.
- **FSEQ export** — custom binary encoder in `fseqExport.js`; channel count depends on the show's `carModel`

### Backend
- **Database** — better-sqlite3 (synchronous, no ORM). All queries in `database.js`.
- **Auth** — Firebase App Check for /api/generate-show, cookie-based for admin, X-Device-Id header for chat/analytics/votes
- **AI generation** — OpenAI API (model via .env). The LLM picks patterns; `patterns.js` expands them into events.
- **Rate limiting** — express-rate-limit per route group
- **Admin UI** — plain HTML/CSS/JS pages (no framework), served from `backend/public/`

## Code style rules

- No TypeScript — everything is JavaScript (.js)
- React Native functional components only, no classes
- Use `const` by default, `let` only when needed
- 2-space indentation
- Single quotes for strings
- Semicolons, in both app and backend code (match the surrounding file)
- Comments in English, variable names in English
- UI text always through i18n `t()` function, never hardcoded
- All new i18n keys MUST be added to all 4 locale files (en, fr, de, es)
- Never add emojis to code unless explicitly requested
- Keep imports at the top of every file

## Critical rules

- **NEVER collect personal data** — no names, emails, IPs in analytics. Only anonymous device IDs.
- **NEVER block user actions for analytics/votes** — all tracking is fire-and-forget with try/catch
- **NEVER hardcode API keys** — use .env for backend, apiConfig.js for mobile
- **ALWAYS preserve existing comments** — don't add or remove comments unless asked
- **ALWAYS check i18n** — every user-facing string needs `t('key')` in all 4 locales; run `node scripts/check-i18n.mjs`
- **Backward compatibility** — released apps keep calling the backend and keep old saved shows. Never break an API shape or a stored show field.
- **The FSEQ output runs on customers' cars** — use the `fseq-export` skill before touching `fseqExport.js` or channel maps
- **Closure limits are hardware limits** — use the `tesla-closures` skill
- **Model 3 vs Juniper** — every part/export change must work for both `carModel`s; Juniper-only parts never appear on a Model 3
