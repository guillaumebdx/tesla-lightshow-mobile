---
paths:
  - "backend/**"
---

# Backend Rules

## Stack
- Express 4 + better-sqlite3 + Node.js
- All DB logic in `backend/src/services/database.js` — single file, synchronous queries
- Routes in `backend/src/routes/` — one file per feature domain

## Database
- SQLite file at `backend/data/lightshow.db` (gitignored, auto-created)
- Tables: `generations`, `conversations`, `messages`, `push_subscriptions`, `analytics_events`, `model_votes`
- All schema creation is inline `db.exec(CREATE TABLE IF NOT EXISTS ...)` at top of `database.js`
- Export all helpers at the bottom of `database.js`
- When adding a new table: add schema at top, helpers in the middle (grouped with comment separators), exports at bottom

## Routes
- `generateShow.js` — AI show generation (App Check protected via `verifyAppCheck` middleware)
- `chat.js` — User-facing chat (X-Device-Id auth)
- `analytics.js` — Anonymous analytics ingestion (X-Device-Id auth, rate limited)
- `votes.js` — Model voting (X-Device-Id auth, rate limited)
- `admin.js` — Admin dashboard pages + API routes (cookie auth via `adminAuth` middleware)
- `adminChat.js` — Admin chat management API (mounted under admin.js)

## Route registration in index.js
- Rate limiters are defined inline in `index.js` before mounting
- Admin routes: `app.use('/admin', adminRoute)` — auth handled inside
- API routes: mounted at `/api/<feature>`
- App Check only on `/api/generate-show`

## Admin pages
- Plain HTML/CSS/JS in `backend/public/`
- No build step, no framework
- Fetch admin API endpoints via relative URLs (`/admin/api/...`)
- All pages check auth via `fetch('/admin/auth-check')`
- Style: dark theme with CSS variables (--bg, --text, --accent, etc.)

## Environment variables
- See `backend/.env.example` for all required vars
- OPENAI_API_KEY, OPENAI_MODEL, OPENAI_CHAT_MODEL, GOOGLE_APPLICATION_CREDENTIALS
- ADMIN_PASSWORD, PORT, CORS_ORIGIN, NODE_ENV
- VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

## Conventions
- Use semicolons in backend code
- Use `console.error('[Tag] message')` for logging with contextual tags
- Rate limit all public endpoints
- Validate all inputs (check headers, body params, lengths)
- Return `{ error: 'message' }` on failure, `{ ok: true, ... }` on success
