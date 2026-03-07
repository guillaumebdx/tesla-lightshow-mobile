# LightShow Studio — Backend API

Express.js API for AI-powered Tesla light show generation, protected by Firebase App Check.

## Architecture

```
POST /api/generate-show
  → App Check verification (Firebase Admin SDK)
  → Rate limiting (20 req / 15 min per IP)
  → Waveform downsampling (→ 200 points)
  → GPT-4o mini (JSON mode)
  → Event sanitization & validation
  → JSON response
```

## Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- **OPENAI_API_KEY**: Your OpenAI API key
- **GOOGLE_APPLICATION_CREDENTIALS**: Path to Firebase service account JSON
- **PORT**: Server port (default 3001)
- **CORS_ORIGIN**: Allowed origin (* for dev)

### 3. Firebase service account

Download from Firebase Console → Project Settings → Service Accounts → Generate New Private Key.
Save as `backend/service-account.json` (gitignored).

### 4. Run

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

## API

### `GET /health`

Health check endpoint. No auth required.

**Response:**
```json
{ "status": "ok", "timestamp": 1709830000000 }
```

### `POST /api/generate-show`

Generate a light show from waveform data.

**Headers:**
```
X-Firebase-AppCheck: <token>
Content-Type: application/json
```

**Body:**
```json
{
  "waveform": [0.1, 0.3, 0.8, ...],
  "durationMs": 78600,
  "mood": "spooky",
  "trackTitle": "Halloween Background"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `waveform` | `number[]` | ✅ | Amplitude values 0-1 from waveform JSON |
| `durationMs` | `number` | ✅ | Track duration in ms (min 5s, max 5min) |
| `mood` | `string` | ❌ | One of: intense, chill, spooky, epic, festive, romantic, auto |
| `trackTitle` | `string` | ❌ | Track name (helps the LLM with context) |

**Response:**
```json
{
  "events": [
    {
      "id": "ai_1",
      "part": "light_left_front",
      "startMs": 500,
      "endMs": 3000,
      "effect": "solid",
      "power": 100,
      "blinkSpeed": 0,
      "easeIn": true,
      "easeOut": false,
      "retroMode": "roundtrip",
      "windowMode": "window_dance",
      "windowDurationMs": 10000,
      "trunkMode": "trunk_open",
      "flapMode": "flap_open"
    }
  ]
}
```

## Deployment (VPS)

### With PM2

```bash
npm install -g pm2
cd backend
pm2 start src/index.js --name lightshow-api
pm2 save
pm2 startup
```

### Nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name api.lightstudio.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.lightstudio.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.lightstudio.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Let's Encrypt SSL

```bash
sudo certbot --nginx -d api.lightstudio.yourdomain.com
```

## Cost estimate

GPT-4o mini pricing (~$0.001 per show):
- Input: ~2K tokens (system prompt + waveform) = $0.0003
- Output: ~5K tokens (JSON events) = $0.0006
- **Total: ~$0.001 per generation**

| Usage | Cost/month |
|-------|-----------|
| 100 shows | $0.10 |
| 1,000 shows | $1.00 |
| 10,000 shows | $10.00 |
