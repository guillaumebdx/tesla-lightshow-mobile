---
paths:
  - "backend/src/routes/**"
  - "backend/src/index.js"
  - "src/**Service*.js"
  - "src/apiConfig.js"
---

# API contract

Base URL: `https://lightstudio.harari.ovh` (prod) / `http://localhost:3001` (dev), from `src/apiConfig.js`.

## Public API — used by the mobile app (old versions too: keep backward compatible)

Mounting and rate limiters are in `backend/src/index.js`.

| Method & path | Auth | Body / query | Notes |
|---|---|---|---|
| `POST /api/generate-show` | Firebase App Check (`verifyAppCheck`) | `{ waveform, durationMs, mood, trackTitle, userPrompt, carModel }` | `carModel` coerced to `model_3` or `model_y_juniper` |
| `POST /api/chat/messages` | `X-Device-Id` | `{ content, deviceInfo? }` | |
| `GET /api/chat/messages?since_id=<id>` | `X-Device-Id` | | poll |
| `GET /api/chat/status` | `X-Device-Id` | | unread count |
| `POST /api/analytics` | `X-Device-Id` | `{ events: [{ eventType, metadata?, timestamp? }] }` | unknown `eventType`s are skipped; list in `VALID_EVENT_TYPES` (`routes/analytics.js`) |
| `POST /api/votes` | `X-Device-Id` | `{ carModel }` | allowed values: `VALID_MODELS` (`routes/votes.js`) |
| `GET /api/votes` | `X-Device-Id` | | this device's votes |
| `GET /health` | none | | `{ status: 'ok', timestamp }` |

Allowed values (event types, vote models, car models) live in the route files. Read them there instead of trusting a copy.

## Admin API

Cookie auth (`admin_token`, set by `POST /admin/login`). All routes are in `backend/src/routes/admin.js`, and `adminChat.js` is mounted at `/admin/api/chat`. Pages are served from `backend/public/`. Read those files for the current list.
