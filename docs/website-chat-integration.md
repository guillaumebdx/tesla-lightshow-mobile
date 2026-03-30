# Website Support Chat — Integration Guide

This document contains everything needed to build a support chat widget on the LightShow Studio marketing website. The chat connects to the existing backend API at `https://lightstudio.harari.ovh`.

---

## 1. Architecture Overview

The backend already handles everything: conversations, messages, admin replies, push notifications. The website just needs a **chat widget** (floating bubble + chat panel) that:

1. Generates a unique visitor ID and stores it in `localStorage`
2. Sends messages via `POST /api/chat/messages`
3. Polls for new messages (admin replies) via `GET /api/chat/messages?since_id=X`
4. Optionally polls for unread count via `GET /api/chat/status`

The admin (Guillaume) replies from the PWA at `https://lightstudio.harari.ovh/admin/chat`.

---

## 2. API Reference

**Base URL:** `https://lightstudio.harari.ovh`

**CORS:** The backend allows cross-origin requests (configured with `cors()`). The website domain may need to be added to `CORS_ORIGIN` env var on the backend if it's currently set to `*` it already works.

**Required header on ALL chat endpoints:**
```
X-Device-Id: <unique-visitor-id>
```
This is the conversation identifier. Generate a UUID once per visitor and store it in `localStorage`.

### 2.1 Send a message

```
POST /api/chat/messages
Content-Type: application/json
X-Device-Id: <visitor-id>

{
  "content": "Hello, I have a question about...",
  "deviceInfo": "{\"os\":\"Web\",\"browser\":\"Chrome\",\"lang\":\"fr\",\"source\":\"website\"}"
}
```

**Response:**
```json
{ "ok": true, "messageId": 42 }
```

**Rules:**
- `content` is required, max 2000 characters
- `deviceInfo` is optional but recommended — it's a JSON **string** (stringified object). Use it to pass browser/language/source info so the admin knows the message came from the website vs the mobile app.
- Rate limited: 60 POST requests per 15 minutes per IP

### 2.2 Fetch messages

```
GET /api/chat/messages
X-Device-Id: <visitor-id>
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "conversation_id": "visitor-uuid-here",
      "sender": "user",
      "content": "Hello!",
      "created_at": "2025-03-28 16:00:00"
    },
    {
      "id": 2,
      "conversation_id": "visitor-uuid-here",
      "sender": "admin",
      "content": "Hi! How can I help?",
      "created_at": "2025-03-28 16:01:00"
    }
  ]
}
```

**Incremental polling (important!):** After the first full load, use `since_id` to only get new messages:
```
GET /api/chat/messages?since_id=2
X-Device-Id: <visitor-id>
```
This returns only messages with `id > 2`. This is how you poll efficiently.

**Note:** `created_at` is UTC, no timezone suffix. Append `Z` or `+00:00` when parsing: `new Date(msg.created_at + 'Z')`.

### 2.3 Check status (lightweight poll)

```
GET /api/chat/status
X-Device-Id: <visitor-id>
```

**Response (conversation exists):**
```json
{ "exists": true, "unread": 1, "status": "open" }
```

**Response (no conversation yet):**
```json
{ "exists": false, "unread": 0 }
```

Use `unread` to show a badge on the chat bubble icon.

---

## 3. Visitor ID Generation

Generate a UUID v4 once and persist it:

```javascript
function getVisitorId() {
  let id = localStorage.getItem('ls_chat_visitor_id');
  if (!id) {
    id = crypto.randomUUID(); // all modern browsers support this
    localStorage.setItem('ls_chat_visitor_id', id);
  }
  return id;
}
```

**Important:** Prefix the ID with `web_` to distinguish website visitors from mobile app users in the admin panel:

```javascript
function getVisitorId() {
  let id = localStorage.getItem('ls_chat_visitor_id');
  if (!id) {
    id = 'web_' + crypto.randomUUID();
    localStorage.setItem('ls_chat_visitor_id', id);
  }
  return id;
}
```

---

## 4. Device Info

Pass useful context about the visitor so the admin knows where the message came from:

```javascript
function getDeviceInfo() {
  return JSON.stringify({
    os: 'Web',
    browser: navigator.userAgent.split(' ').pop(),
    lang: navigator.language || 'unknown',
    source: 'website',
    page: window.location.pathname,
  });
}
```

This is sent only with the **first message** (or every message, it doesn't matter — the backend updates it each time).

---

## 5. Chat Widget — Recommended Implementation

### 5.1 UI Structure

Build a floating chat widget with these states:

1. **Closed** — A floating bubble button (bottom-right corner) with optional unread badge
2. **Open** — A chat panel (~380px wide, ~500px tall on desktop, full-screen on mobile) containing:
   - Header: "LightShow Studio Support" + close button
   - Messages area (scrollable)
   - Input area: textarea + send button

### 5.2 Message styling

- **User messages** (`sender === 'user'`): aligned right, colored background (e.g. brand color `#e94560`)
- **Admin messages** (`sender === 'admin'`): aligned left, neutral background
- Show timestamp under each message

### 5.3 Polling Strategy

```javascript
// Poll for new messages every 3 seconds when chat is open
let pollTimer = null;
let lastMsgId = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const url = lastMsgId
      ? `/api/chat/messages?since_id=${lastMsgId}`
      : '/api/chat/messages';
    const res = await fetch('https://lightstudio.harari.ovh' + url, {
      headers: { 'X-Device-Id': getVisitorId() },
    });
    const data = await res.json();
    if (data.messages?.length > 0) {
      appendMessages(data.messages);
      lastMsgId = data.messages[data.messages.length - 1].id;
    }
  }, 3000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
```

**When chat is closed**, poll the lightweight status endpoint instead (every 10-15 seconds) to update the unread badge:

```javascript
let statusTimer = null;

function startStatusPolling() {
  statusTimer = setInterval(async () => {
    const res = await fetch('https://lightstudio.harari.ovh/api/chat/status', {
      headers: { 'X-Device-Id': getVisitorId() },
    });
    const data = await res.json();
    updateBadge(data.unread || 0);
  }, 15000);
}
```

### 5.4 Sending a message

```javascript
async function sendMessage(content) {
  const res = await fetch('https://lightstudio.harari.ovh/api/chat/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': getVisitorId(),
    },
    body: JSON.stringify({
      content,
      deviceInfo: getDeviceInfo(),
    }),
  });
  const data = await res.json();
  if (data.ok) {
    // Optimistically add the message to the UI immediately
    appendMessages([{
      id: data.messageId,
      sender: 'user',
      content,
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    }]);
    lastMsgId = data.messageId;
  }
}
```

### 5.5 Deduplication

Keep a `Set` of rendered message IDs to avoid duplicates when polling returns messages you already have:

```javascript
const renderedIds = new Set();

function appendMessages(messages) {
  const newMsgs = messages.filter(m => !renderedIds.has(m.id));
  newMsgs.forEach(m => {
    renderedIds.add(m.id);
    // render message in DOM
  });
}
```

---

## 6. Design Recommendations

### Colors (match LightShow Studio branding)
- **Primary/accent:** `#e94560` (red-pink)
- **Chat bubble background:** `#e94560`
- **User message bubble:** `#e94560` with white text
- **Admin message bubble:** `#f0f0f0` (light gray) with dark text, or `#1a1a35` with light text if dark theme
- **Chat panel background:** white or very light gray for a website (not dark like the admin panel)

### Chat bubble icon
Use a speech bubble / message icon. Show the unread count as a small red badge (top-right of the bubble).

### Welcome message
When the chat opens and there are no messages yet, show a static welcome message (not sent to the API):

> **👋 Hi! Ask us anything about LightShow Studio.**
> We usually reply within a few minutes.

### Mobile behavior
On screens < 640px, the chat panel should be full-screen (100vw × 100vh) with a close/back button in the header.

---

## 7. Quick Summary — What to Build

| Component | Description |
|---|---|
| **Floating button** | Fixed bottom-right, round, `#e94560`, chat icon, unread badge |
| **Chat panel** | 380×500px desktop, full-screen mobile, white/light bg |
| **Header** | "Support LightShow Studio" + close X button |
| **Messages** | User = right/red, Admin = left/gray, timestamps |
| **Input** | Textarea + Send button, Enter to send, Shift+Enter for newline |
| **Visitor ID** | `localStorage` UUID prefixed `web_` |
| **Polling** | 3s message poll when open, 15s status poll when closed |
| **Dedup** | `Set<id>` to avoid rendering duplicates |

---

## 8. Minimal Working Example

Here's a self-contained vanilla JS/HTML snippet that can be dropped into any page as a starting point:

```html
<div id="chat-widget"></div>
<script>
const API = 'https://lightstudio.harari.ovh';

function getVisitorId() {
  let id = localStorage.getItem('ls_chat_visitor_id');
  if (!id) { id = 'web_' + crypto.randomUUID(); localStorage.setItem('ls_chat_visitor_id', id); }
  return id;
}

function getDeviceInfo() {
  return JSON.stringify({ os: 'Web', browser: navigator.userAgent, lang: navigator.language, source: 'website', page: location.pathname });
}

const headers = () => ({ 'X-Device-Id': getVisitorId(), 'Content-Type': 'application/json' });

async function sendMsg(content) {
  return fetch(API + '/api/chat/messages', { method: 'POST', headers: headers(), body: JSON.stringify({ content, deviceInfo: getDeviceInfo() }) }).then(r => r.json());
}

async function getMessages(sinceId) {
  const url = sinceId ? `/api/chat/messages?since_id=${sinceId}` : '/api/chat/messages';
  return fetch(API + url, { headers: { 'X-Device-Id': getVisitorId() } }).then(r => r.json());
}

async function getStatus() {
  return fetch(API + '/api/chat/status', { headers: { 'X-Device-Id': getVisitorId() } }).then(r => r.json());
}
</script>
```

Build the full UI around these three functions. That's all the backend interaction needed.

---

## 9. Important Notes

- **No authentication required** — chat endpoints are public, secured by rate limiting + device ID
- **No App Check** — unlike `/api/generate-show`, chat routes do NOT require Firebase App Check tokens
- **Admin replies arrive as `sender: "admin"`** — the admin types from the PWA, the website just polls and displays them
- **The admin gets push notifications** when a user sends a message — no extra work needed on the website side
- **Rate limit:** 60 messages per 15 minutes per IP (POST only). GET polling is unlimited.
- **Max message length:** 2000 characters
- **Timestamps are UTC** without timezone suffix — always append `'Z'` when parsing with `new Date()`
