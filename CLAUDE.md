# LightShow Studio — Project Context for Claude Code

@README.md
@package.json
@app.json
@backend/package.json
@backend/.env.example

## What is this project?

**LightShow Studio** is a React Native (Expo) mobile app that lets users create custom Tesla Light Shows using a 3D vehicle editor with a music-synced timeline. It includes:

- A **mobile app** (iOS + Android) built with Expo SDK 54 + React Native 0.81
- A **Node.js backend** (Express + SQLite) for AI show generation, admin dashboard, chat support, analytics, and votes

Production URL: `https://lightstudio.harari.ovh`
Bundle ID iOS: `com.guillaumebdx.lightstudiofortesla`
Package Android: `com.guillaumebdx.tesla3dviewer`

## Project structure

```
/ (root)                    ← Expo/React Native mobile app
├── App.js                  ← Entry point, simple state-based nav (home/new/editor)
├── src/                    ← All mobile source code
│   ├── ModelViewer.js      ← Main editor (3D viewer + timeline + settings) — LARGEST FILE ~2800 lines
│   ├── AudioTimeline.js    ← Music timeline with drag/drop events — ~1450 lines
│   ├── HomeScreen.js       ← Show list, settings, about, demo
│   ├── NewShowScreen.js    ← Car model picker + show creation + vote CTA
│   ├── PartOptionsPanel.js ← Part parameter editor (duration, effect, power)
│   ├── ExportModal.js      ← FSEQ/MP3 export tutorial wizard
│   ├── AiPromptModal.js    ← AI generation prompt UI
│   ├── SupportChat.js      ← In-app live chat with developer
│   ├── DemoViewer.js       ← Demo show viewer
│   ├── TutorialOverlay.js  ← First-time tutorial
│   ├── FlashMessage.js     ← Toast notifications
│   ├── constants.js        ← Vehicle parts, effects, closure limits, icons, colors
│   ├── storage.js          ← AsyncStorage CRUD for shows
│   ├── fseqExport.js       ← Binary FSEQ file encoder (Tesla format)
│   ├── aiService.js        ← AI generation API client
│   ├── analyticsService.js ← Anonymous analytics (queue + batch + offline-safe)
│   ├── voteService.js      ← Model vote (optimistic cache + fire-and-forget)
│   ├── chatService.js      ← Chat API client
│   ├── deviceId.js         ← Anonymous device ID (AsyncStorage, prefix 'dev_')
│   ├── apiConfig.js        ← API_BASE_URL (dev=localhost, prod=lightstudio.harari.ovh)
│   ├── audioPicker.js      ← MP3 import + waveform analysis
│   ├── waveformGenerator.js← Waveform bar computation
│   ├── firebase.js         ← Firebase App Check init
│   ├── i18n/               ← Translations (en.json, fr.json, de.json, es.json)
│   └── demoShows/          ← Built-in demo show data
├── assets/                 ← Images, icons, 3D models (.glb), MP3 tracks
├── backend/                ← Standalone Express API server
│   ├── src/
│   │   ├── index.js        ← Express server entry, route mounting, rate limiting
│   │   ├── systemPrompt.js ← LLM system prompt for AI show generation
│   │   ├── routes/
│   │   │   ├── generateShow.js ← POST /api/generate-show (App Check protected)
│   │   │   ├── chat.js         ← POST/GET /api/chat/* (user chat)
│   │   │   ├── analytics.js    ← POST /api/analytics (batch event ingestion)
│   │   │   ├── votes.js        ← POST/GET /api/votes (model voting)
│   │   │   ├── admin.js        ← Admin dashboard + API routes
│   │   │   └── adminChat.js    ← Admin chat management API
│   │   ├── services/
│   │   │   ├── database.js     ← SQLite schema + all DB helpers (better-sqlite3)
│   │   │   ├── llmService.js   ← OpenAI API integration for show generation
│   │   │   ├── patterns.js     ← Light show pattern library for AI
│   │   │   ├── pushService.js  ← Web Push notifications
│   │   │   └── logBroadcaster.js ← SSE log streaming to admin
│   │   └── middleware/
│   │       ├── appCheck.js     ← Firebase App Check verification
│   │       └── adminAuth.js    ← Cookie-based admin auth
│   ├── public/             ← Admin dashboard HTML pages
│   │   ├── index.html      ← Admin landing page
│   │   ├── login.html      ← Admin login
│   │   ├── dashboard.html  ← AI generation stats + logs
│   │   ├── analytics.html  ← App usage analytics + model votes
│   │   ├── chat.html       ← Support chat management
│   │   ├── sw.js           ← Service worker for push notifications
│   │   └── manifest.json   ← PWA manifest
│   ├── data/               ← SQLite DB file (lightshow.db, gitignored)
│   └── .env                ← Secrets (gitignored, see .env.example)
├── docs/                   ← Documentation
├── FSEQ_SPEC.md            ← Tesla FSEQ binary format specification
├── LIGHTS.md               ← Light channel mapping for all Tesla models
├── CLOSURES.md             ← Closure (window/trunk/mirror) behavior spec
└── GLB_PIPELINE.md         ← 3D model preparation pipeline
```

## Commands

### Mobile app
```bash
npm install                  # Install dependencies
npx expo start               # Start Expo dev server
npx expo run:android         # Run on Android
npx expo run:ios             # Run on iOS
eas build --platform ios --profile production   # Production iOS build
eas build --platform android --profile production # Production Android build
eas submit --platform ios    # Submit to App Store
eas submit --platform android # Submit to Google Play
```

### Backend
```bash
cd backend
npm install                  # Install dependencies
npm run dev                  # Start with --watch (dev)
npm start                    # Start production
```

### Deployment (VPS)
```bash
# Backend runs on VPS via PM2 behind Nginx
cd backend && git pull && npm install && pm2 restart all
```

## Key technical decisions

### Mobile
- **No navigation library** — simple `useState` screen switching in App.js (`home`/`new`/`editor`)
- **3D rendering** — expo-gl + expo-three + THREE.js with GLB models
- **State management** — local `useState`/`useRef` only, no Redux/Context
- **Persistence** — AsyncStorage for everything (shows, settings, device ID, analytics queue)
- **Analytics/Votes** — fire-and-forget pattern. NEVER block UI. NEVER throw. Catch all errors silently.
- **i18n** — i18next with 4 locales: en, fr, de, es. All keys must exist in all 4 files.
- **FSEQ export** — custom binary encoder in `fseqExport.js` following Tesla's FSEQ v2 spec

### Backend
- **Database** — better-sqlite3 (synchronous, no ORM). All queries in `database.js`.
- **Auth** — Firebase App Check for /api/generate-show, cookie-based for admin, X-Device-Id header for chat/analytics/votes
- **AI generation** — OpenAI API (configurable model via .env). System prompt in `systemPrompt.js`, patterns in `patterns.js`.
- **Rate limiting** — express-rate-limit per route group
- **Admin UI** — plain HTML/CSS/JS pages (no framework), served from `backend/public/`

## Code style rules

- No TypeScript — everything is JavaScript (.js)
- React Native functional components only, no classes
- Use `const` by default, `let` only when needed
- 2-space indentation
- Single quotes for strings
- No semicolons in frontend code (except where required)
- Semicolons in backend code
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
- **ALWAYS test i18n** — every user-facing string needs `t('key')` with entries in all 4 locales
- **ModelViewer.js is ~2800 lines** — be careful with edits, always read the specific section first
- **The FSEQ binary format is critical** — see FSEQ_SPEC.md before touching fseqExport.js
- **Closure limits exist** — see CLOSURES.md for vehicle constraints on windows/trunks/mirrors
