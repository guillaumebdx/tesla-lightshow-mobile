---
name: deploy-backend
description: Deploy the Express backend (backend/) to the production VPS (PM2 behind Nginx, https://lightstudio.harari.ovh). Use only when the user explicitly asks to deploy or ship the backend.
disable-model-invocation: true
---

# Deploy the backend

Production runs on a VPS: PM2 process behind Nginx (`backend/nginx/lightstudio.harari.ovh.conf`), SQLite DB at `backend/data/lightshow.db` (not in git, lives only on the server).

## Before deploying

1. **Old apps keep calling this API.** Check that every changed route still accepts the request shapes sent by released app versions, and that responses stay readable by them. Look at the diff of `backend/src/routes/` and `backend/src/services/llmService.js` since the last deploy.
2. If generation changed: `cd backend && node tests/test-generation.js --runs 1` (one paid OpenAI call, see the `ai-show-generation` skill).
3. If `database.js` adds a table or column: schema creation is `CREATE TABLE IF NOT EXISTS` at startup. A **new column on an existing table** needs an `ALTER TABLE ... ADD COLUMN` wrapped in `try {} catch {}`, like the existing ones near the top of `database.js`. Otherwise production never gets the column.
4. New env var? Add it to `backend/.env.example`, and tell the user to set it on the server **before** restarting.
5. Commit and push to `origin/master` (ask first).

## Deploy

Claude has no access to the VPS. Give the user these commands to run there:

```bash
cd <repo>/backend && git pull && npm install && pm2 restart all
pm2 logs --lines 50          # watch startup
curl -s https://lightstudio.harari.ovh/health
```

Then check the live logs in the admin dashboard (`/admin/dashboard`).
