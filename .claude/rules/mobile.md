---
paths:
  - "src/**"
  - "App.js"
---

# Mobile App Rules

## Stack
- Expo SDK 54, React Native 0.81, React 19.1, new architecture enabled
- 3D: expo-gl + expo-three + THREE.js (GLB models, textures stripped)
- Audio: expo-av
- Storage: @react-native-async-storage/async-storage
- i18n: i18next + react-i18next
- Icons: @expo/vector-icons (Ionicons)
- No navigation library — state-based in App.js

## Architecture
- `App.js` manages 3 screens via `useState('home' | 'new' | 'editor')`
- No global state management (no Redux, no Context) — everything is local state
- Very large files — never read them whole, grep for the symbol then read the section: `ModelViewer.js` (~3400 lines), `AudioTimeline.js` (~1500 lines)
- Services are standalone modules: `analyticsService.js`, `voteService.js`, `chatService.js`, `aiService.js`

## Multi-car support
- Supported cars: `model_3` (48-channel FSEQ) and `model_y_juniper` (200-channel FSEQ), registered in `src/carModels.js` (GLB, channel count, scale, feature flags)
- Every show has a `carModel`. Anything part- or export-related must take it into account.
- `JUNIPER_ONLY_PARTS` in `constants.js` must never appear on a Model 3 (filtered when the GLB loads)
- Adding a car: `add-car-model` skill. Adding a part: `add-vehicle-part` skill.

## Key patterns

### Fire-and-forget services
`analyticsService.js` and `voteService.js` follow a strict pattern:
- NEVER throw exceptions
- NEVER block the UI thread
- ALWAYS wrap in try/catch with empty catch
- Use optimistic local caching (AsyncStorage)
- Queue events and batch send to backend
- Silent retry on network failure

### Device identification
- `deviceId.js` generates a random UUID prefixed `dev_`, stored in AsyncStorage
- Used as `X-Device-Id` header for chat, analytics, votes
- NEVER send personal data

### Show data model
Shows are stored in AsyncStorage (`src/storage.js`, see `createShow`). Shape:
```json
{
  "id": "…", "name": "Light Show #1", "carModel": "model_3 | model_y_juniper",
  "createdAt": 0, "updatedAt": 0, "trackId": "…", "isBuiltinTrack": true,
  "bodyColor": "#222222", "cursorOffsetMs": 0,
  "events": [{ "part": "left_high_light", "startMs": 1000, "endMs": 1500, "effect": "solid", "power": 100, "easeIn": false, "easeOut": false, "...": "per-type options" }]
}
```
Event options and defaults: `DEFAULT_EVENT_OPTIONS` in `constants.js`. Saved shows from older app versions must keep loading. Never rename or remove a stored field without a fallback.

### Vehicle parts and effects
- Source of truth: `INTERACTIVE_PARTS`, the type sets (`RGB_PARTS`, `PULSE_PARTS`, `JUNIPER_ONLY_PARTS`) and the `is*()` helpers in `src/constants.js`. Read it instead of trusting a list here.
- Model 3 front lights are `left_high_light` / `left_signature_light` (+ right). `light_left_front` / `light_right_front` are Juniper-only combined headlights.
- Light effects: `EFFECT_TYPES` = `solid`, `blink`, `pulse`, plus `easeIn` / `easeOut` flags, `power` 1-100
- Closures (mirrors, windows, trunk, flap): fixed modes with hard per-show limits — `tesla-closures` skill
- Export: `fseq-export` skill

## Styling
- Dark theme: background `#0a0a1a`, cards `#12122a`, borders `#1e1e3a`
- Accent blue: `#44aaff`, accent red: `#e94560`
- All styles via `StyleSheet.create()` at bottom of each file
- No external CSS, no styled-components, no Tailwind

## API communication
- `apiConfig.js` exports `API_BASE_URL` (dev=localhost:3001, prod=lightstudio.harari.ovh)
- All API calls include `X-Device-Id` header (except AI generation which uses App Check)
- Contract: `.claude/rules/api-endpoints.md`
