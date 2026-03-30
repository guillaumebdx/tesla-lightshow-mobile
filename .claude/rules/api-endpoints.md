---
paths:
  - "backend/src/routes/**"
  - "src/**Service*.js"
  - "src/apiConfig.js"
---

# API Endpoints Reference

Base URL: `https://lightstudio.harari.ovh` (prod) / `http://localhost:3001` (dev)

## Public API (mobile app)

### AI Generation
- `POST /api/generate-show` — Generate a light show from music analysis
  - Auth: Firebase App Check token (header `X-Firebase-AppCheck`)
  - Body: `{ waveform, duration, carModel, prompt?, language? }`
  - Rate limit: 40 req / 15 min per IP

### Chat
- `POST /api/chat/messages` — Send a message
  - Auth: `X-Device-Id` header
  - Body: `{ content, deviceInfo? }`
  - Rate limit: 60 req / 15 min (POST only)
- `GET /api/chat/messages?since=<messageId>` — Poll for new messages
  - Auth: `X-Device-Id` header
- `GET /api/chat/status` — Get unread count
  - Auth: `X-Device-Id` header

### Analytics
- `POST /api/analytics` — Batch ingest analytics events
  - Auth: `X-Device-Id` header
  - Body: `{ events: [{ eventType, metadata?, timestamp? }] }` (max 50 per batch)
  - Rate limit: 30 req / 15 min
  - Event types: `show_created`, `fseq_exported`, `music_selected`

### Votes
- `POST /api/votes` — Vote for a car model
  - Auth: `X-Device-Id` header
  - Body: `{ carModel }` (one of: `model_s`, `model_x`, `cybertruck`)
  - Rate limit: 20 req / 15 min
- `GET /api/votes` — Get this device's votes
  - Auth: `X-Device-Id` header

### Health
- `GET /health` — `{ status: 'ok', timestamp }`

## Admin API (dashboard)

All admin routes require cookie auth (set via login).

### Pages
- `GET /admin` — Landing page
- `GET /admin/login` — Login page
- `GET /admin/dashboard` — AI generation stats
- `GET /admin/analytics` — App usage analytics + model votes
- `GET /admin/chat` — Support chat management

### Admin Data API
- `GET /admin/api/generations` — Paginated generations list
- `GET /admin/api/stats` — Generation stats summary
- `GET /admin/api/top-users` — Top users by generation count
- `GET /admin/api/analytics/stats` — Analytics totals (all-time + today)
- `GET /admin/api/analytics/events?page=&type=&date=` — Paginated analytics events
- `GET /admin/api/analytics/daily?days=14` — Daily analytics summary
- `GET /admin/api/votes` — Model vote counts
- `GET /admin/api/chat/conversations` — All chat conversations
- `POST /admin/api/chat/conversations/:id/reply` — Reply to a conversation
- `POST /admin/api/push/subscribe` — Save push subscription
- `GET /admin/api/push/vapid-key` — Get VAPID public key
- `GET /admin/api/logs/stream` — SSE stream of server logs

### Auth
- `POST /admin/login` — `{ password }` → sets `admin_token` cookie
- `GET /admin/auth-check` — `{ authenticated: true/false }`
