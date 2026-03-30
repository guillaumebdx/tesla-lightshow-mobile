---
paths:
  - "src/**"
  - "App.js"
---

# Mobile App Rules

## Stack
- Expo SDK 54, React Native 0.81, React 19.1
- 3D: expo-gl + expo-three + THREE.js (GLB models)
- Audio: expo-av
- Storage: @react-native-async-storage/async-storage
- i18n: i18next + react-i18next
- Icons: @expo/vector-icons (Ionicons)
- No navigation library — state-based in App.js

## Architecture
- `App.js` manages 3 screens via `useState('home' | 'new' | 'editor')`
- No global state management (no Redux, no Context) — everything is local state
- Heavy components: `ModelViewer.js` (~2800 lines), `AudioTimeline.js` (~1450 lines)
- Services are standalone modules: `analyticsService.js`, `voteService.js`, `chatService.js`, `aiService.js`

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
Shows are stored in AsyncStorage with this structure:
```json
{
  "id": "uniqueId",
  "name": "My Show",
  "carModel": "model_3",
  "events": [{ "part": "light_left_front", "startMs": 1000, "durationMs": 500, "effect": "on", "power": 1, ... }],
  "track": { "id": "track1", "title": "...", "isBuiltin": true },
  "settings": { "bodyColor": "#ffffff", "cursorOffsetMs": 0, "playbackSpeed": 1, "timelineScale": 1 }
}
```

### Vehicle parts
All interactive parts are defined in `constants.js`:
- Lights: `light_left_front`, `light_right_front`, `light_left_back`, `light_right_back`
- Turn signals: `blink_front_left`, `blink_front_right`, `blink_back_left`, `blink_back_right`
- Windows: `window_left_front`, `window_right_front`, `window_left_back`, `window_right_back`
- Mirrors: `retro_left`, `retro_right`
- Others: `trunk`, `flap`, `license_plate`, `brake_lights`, `rear_fog`, `side_repeater_left`, `side_repeater_right`

### Effects
- Lights: `on`, `fade_in`, `fade_out`, `pulse`, `strobe`
- Closures (windows/trunk/mirrors): open, close, dance — with strict usage limits per show (see CLOSURES.md)

## i18n
- 4 locales: `en.json`, `fr.json`, `de.json`, `es.json`
- ALL user-facing strings use `t('section.key')`
- When adding any new string: add the key to ALL 4 files
- Sections: `app`, `home`, `settings`, `newShow`, `editor`, `aiPrompt`, `timeline`, `parts`, `export`, `share`, `flash`, `tutorial`, `load`, `chat`

## Styling
- Dark theme: background `#0a0a1a`, cards `#12122a`, borders `#1e1e3a`
- Accent blue: `#44aaff`, accent red: `#e94560`
- All styles via `StyleSheet.create()` at bottom of each file
- No external CSS, no styled-components, no Tailwind

## API communication
- `apiConfig.js` exports `API_BASE_URL` (dev=localhost:3001, prod=lightstudio.harari.ovh)
- All API calls include `X-Device-Id` header (except AI generation which uses App Check)
- AI generation: `POST /api/generate-show` with Firebase App Check token
