const Database = require('better-sqlite3');
const path = require('path');
const FIRST_NAMES_POOL = require('../data/firstNames.json');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'lightshow.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    track_title TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    mood TEXT DEFAULT 'auto',
    model TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    events_count INTEGER DEFAULT 0,
    events_removed INTEGER DEFAULT 0,
    coverage_percent REAL DEFAULT 0,
    finish_reason TEXT,
    response_time_ms INTEGER DEFAULT 0,
    beats_detected INTEGER DEFAULT 0,
    peaks_detected INTEGER DEFAULT 0,
    drops_detected INTEGER DEFAULT 0,
    rises_detected INTEGER DEFAULT 0,
    segment_coverage TEXT,
    part_breakdown TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    ip_address TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
`);

// Chat tables
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'open',
    unread_admin INTEGER DEFAULT 0,
    unread_user INTEGER DEFAULT 0,
    device_info TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
`);

// Analytics events table
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_analytics_device ON analytics_events(device_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_events(created_at);
`);

// Model votes table
db.exec(`
  CREATE TABLE IF NOT EXISTS model_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    car_model TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(device_id, car_model)
  );
`);

// Push subscriptions table
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Device names table — each device gets a human-readable first name
db.exec(`
  CREATE TABLE IF NOT EXISTS device_names (
    device_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_device_names_first_name ON device_names(first_name);
`);

// Migration: add device_id column if it doesn't exist
try {
  db.prepare(`SELECT device_id FROM generations LIMIT 1`).get();
} catch {
  db.exec(`ALTER TABLE generations ADD COLUMN device_id TEXT DEFAULT ''`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_generations_device_id ON generations(device_id)`);
}

/**
 * Insert a new generation record (called at request start).
 */
function createGeneration({ requestId, trackTitle, durationMs, mood, model, ipAddress, deviceId }) {
  const stmt = db.prepare(`
    INSERT INTO generations (request_id, track_title, duration_ms, mood, model, status, ip_address, device_id)
    VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)
  `);
  const result = stmt.run(requestId, trackTitle, durationMs, mood || 'auto', model, ipAddress || '', deviceId || '');
  if (deviceId) { try { getOrAssignDeviceName(deviceId); } catch {} }
  return result.lastInsertRowid;
}

/**
 * Update a generation with LLM results (called after successful generation).
 */
function completeGeneration(id, {
  promptTokens, completionTokens, totalTokens, estimatedCost,
  eventsCount, eventsRemoved, coveragePercent, finishReason,
  responseTimeMs, beatsDetected, peaksDetected, dropsDetected, risesDetected,
  segmentCoverage, partBreakdown,
}) {
  const stmt = db.prepare(`
    UPDATE generations SET
      prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, estimated_cost = ?,
      events_count = ?, events_removed = ?, coverage_percent = ?, finish_reason = ?,
      response_time_ms = ?, beats_detected = ?, peaks_detected = ?, drops_detected = ?,
      rises_detected = ?, segment_coverage = ?, part_breakdown = ?, status = 'success'
    WHERE id = ?
  `);
  stmt.run(
    promptTokens, completionTokens, totalTokens, estimatedCost,
    eventsCount, eventsRemoved, coveragePercent, finishReason,
    responseTimeMs, beatsDetected, peaksDetected, dropsDetected,
    risesDetected, segmentCoverage || '', partBreakdown || '', id
  );
}

/**
 * Mark a generation as failed.
 */
function failGeneration(id, errorMessage) {
  const stmt = db.prepare(`UPDATE generations SET status = 'error', error_message = ? WHERE id = ?`);
  stmt.run(errorMessage, id);
}

/**
 * Get recent generations.
 */
function getGenerations({ limit = 50, offset = 0 } = {}) {
  const stmt = db.prepare(`SELECT * FROM generations ORDER BY created_at DESC LIMIT ? OFFSET ?`);
  return stmt.all(limit, offset);
}

/**
 * Get total count of generations (for pagination).
 */
function getGenerationsCount() {
  return db.prepare(`SELECT COUNT(*) as count FROM generations`).get().count;
}

/**
 * Get top users by generation count.
 */
function getTopUsers({ limit = 20 } = {}) {
  return db.prepare(`
    SELECT device_id, COUNT(*) as count,
           COALESCE(SUM(estimated_cost), 0) as total_cost,
           MAX(created_at) as last_seen,
           MIN(created_at) as first_seen
    FROM generations
    WHERE device_id != ''
    GROUP BY device_id
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get aggregate stats.
 */
function getStats() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM generations`).get();
  const success = db.prepare(`SELECT COUNT(*) as count FROM generations WHERE status = 'success'`).get();
  const errors = db.prepare(`SELECT COUNT(*) as count FROM generations WHERE status = 'error'`).get();
  const costRow = db.prepare(`SELECT COALESCE(SUM(estimated_cost), 0) as total FROM generations WHERE status = 'success'`).get();
  const tokensRow = db.prepare(`SELECT COALESCE(SUM(total_tokens), 0) as total FROM generations WHERE status = 'success'`).get();
  const avgEvents = db.prepare(`SELECT COALESCE(AVG(events_count), 0) as avg FROM generations WHERE status = 'success'`).get();
  const avgTime = db.prepare(`SELECT COALESCE(AVG(response_time_ms), 0) as avg FROM generations WHERE status = 'success'`).get();
  const avgCoverage = db.prepare(`SELECT COALESCE(AVG(coverage_percent), 0) as avg FROM generations WHERE status = 'success'`).get();

  const modelBreakdown = db.prepare(`
    SELECT model, COUNT(*) as count, COALESCE(SUM(estimated_cost), 0) as cost, 
           COALESCE(AVG(events_count), 0) as avg_events, COALESCE(AVG(response_time_ms), 0) as avg_time
    FROM generations WHERE status = 'success' GROUP BY model ORDER BY count DESC
  `).all();

  const todayCount = db.prepare(`
    SELECT COUNT(*) as count FROM generations WHERE date(created_at) = date('now')
  `).get();

  const todayCost = db.prepare(`
    SELECT COALESCE(SUM(estimated_cost), 0) as total FROM generations WHERE date(created_at) = date('now') AND status = 'success'
  `).get();

  return {
    total: total.count,
    success: success.count,
    errors: errors.count,
    totalCost: costRow.total,
    totalTokens: tokensRow.total,
    avgEvents: Math.round(avgEvents.avg),
    avgTimeMs: Math.round(avgTime.avg),
    avgCoverage: Math.round(avgCoverage.avg * 10) / 10,
    modelBreakdown,
    todayCount: todayCount.count,
    todayCost: todayCost.total,
  };
}

// ─── Chat helpers ───

function getOrCreateConversation(deviceId, deviceInfo) {
  let conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(deviceId);
  if (!conv) {
    db.prepare(`INSERT INTO conversations (id, device_info) VALUES (?, ?)`)
      .run(deviceId, JSON.stringify(deviceInfo || {}));
    conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(deviceId);
  } else if (deviceInfo && Object.keys(deviceInfo).length > 0) {
    db.prepare('UPDATE conversations SET device_info = ? WHERE id = ?')
      .run(JSON.stringify(deviceInfo), deviceId);
  }
  try { getOrAssignDeviceName(deviceId); } catch {}
  return conv;
}

function addMessage(conversationId, sender, content) {
  const stmt = db.prepare(`
    INSERT INTO messages (conversation_id, sender, content) VALUES (?, ?, ?)
  `);
  const result = stmt.run(conversationId, sender, content);
  // Update conversation
  const unreadCol = sender === 'user' ? 'unread_admin' : 'unread_user';
  db.prepare(`UPDATE conversations SET ${unreadCol} = ${unreadCol} + 1, updated_at = datetime('now'), status = 'open' WHERE id = ?`)
    .run(conversationId);
  return result.lastInsertRowid;
}

function getMessages(conversationId, sinceId) {
  if (sinceId) {
    return db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC')
      .all(conversationId, sinceId);
  }
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId);
}

function getConversationStatus(deviceId) {
  const conv = db.prepare('SELECT unread_user, status FROM conversations WHERE id = ?').get(deviceId);
  return conv || null;
}

function markReadByUser(deviceId) {
  db.prepare('UPDATE conversations SET unread_user = 0 WHERE id = ?').run(deviceId);
}

function markReadByAdmin(conversationId) {
  db.prepare('UPDATE conversations SET unread_admin = 0 WHERE id = ?').run(conversationId);
}

function getAllConversations() {
  return db.prepare(`
    SELECT c.*, 
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT sender FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_sender,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    ORDER BY c.updated_at DESC
  `).all();
}

function setConversationStatus(conversationId, status) {
  db.prepare("UPDATE conversations SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, conversationId);
}

// ─── Model vote helpers ───

function voteForModel(deviceId, carModel) {
  const existing = db.prepare('SELECT id FROM model_votes WHERE device_id = ? AND car_model = ?').get(deviceId, carModel);
  if (existing) return { alreadyVoted: true };
  db.prepare('INSERT INTO model_votes (device_id, car_model) VALUES (?, ?)').run(deviceId, carModel);
  try { getOrAssignDeviceName(deviceId); } catch {}
  return { alreadyVoted: false };
}

function getModelVotes() {
  return db.prepare(`
    SELECT car_model,
           COUNT(*) as votes,
           COUNT(DISTINCT device_id) as unique_voters,
           SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) as votes_today
    FROM model_votes GROUP BY car_model ORDER BY votes DESC
  `).all();
}

function getVotesTodayTotal() {
  return db.prepare(`SELECT COUNT(*) as count FROM model_votes WHERE date(created_at) = date('now')`).get().count;
}

function hasVotedForModel(deviceId, carModel) {
  return !!db.prepare('SELECT id FROM model_votes WHERE device_id = ? AND car_model = ?').get(deviceId, carModel);
}

function getDeviceVotes(deviceId) {
  return db.prepare('SELECT car_model FROM model_votes WHERE device_id = ?').all(deviceId).map(r => r.car_model);
}

// ─── Device name helpers ───

function getDeviceName(deviceId) {
  if (!deviceId) return null;
  const row = db.prepare('SELECT first_name FROM device_names WHERE device_id = ?').get(deviceId);
  return row ? row.first_name : null;
}

function getOrAssignDeviceName(deviceId) {
  if (!deviceId) return null;
  const existing = getDeviceName(deviceId);
  if (existing) return existing;

  const usedRows = db.prepare('SELECT first_name FROM device_names').all();
  const used = new Set(usedRows.map(r => r.first_name));
  const available = FIRST_NAMES_POOL.filter(n => !used.has(n));

  let name;
  if (available.length > 0) {
    name = available[Math.floor(Math.random() * available.length)];
  } else {
    // Pool exhausted — append numeric suffix to a random name
    const base = FIRST_NAMES_POOL[Math.floor(Math.random() * FIRST_NAMES_POOL.length)];
    name = `${base}-${Math.floor(Math.random() * 99999)}`;
  }

  try {
    db.prepare('INSERT INTO device_names (device_id, first_name) VALUES (?, ?)').run(deviceId, name);
    return name;
  } catch {
    // Race condition (device_id already inserted or first_name taken) — re-query and retry once
    const retryExisting = getDeviceName(deviceId);
    if (retryExisting) return retryExisting;
    const fallback = `${FIRST_NAMES_POOL[0]}-${Date.now()}`;
    try {
      db.prepare('INSERT INTO device_names (device_id, first_name) VALUES (?, ?)').run(deviceId, fallback);
      return fallback;
    } catch {
      return null;
    }
  }
}

function getAllKnownDeviceIds() {
  const sets = [
    db.prepare("SELECT DISTINCT device_id FROM analytics_events WHERE device_id != ''").all(),
    db.prepare("SELECT DISTINCT device_id FROM model_votes WHERE device_id != ''").all(),
    db.prepare("SELECT DISTINCT id as device_id FROM conversations").all(),
    db.prepare("SELECT DISTINCT device_id FROM generations WHERE device_id != ''").all(),
  ];
  const all = new Set();
  sets.forEach(rows => rows.forEach(r => r.device_id && all.add(r.device_id)));
  return [...all];
}

// ─── Analytics helpers ───

function insertAnalyticsEvents(events) {
  const stmt = db.prepare(`
    INSERT INTO analytics_events (device_id, event_type, metadata, created_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')))
  `);
  const insertMany = db.transaction((evts) => {
    for (const e of evts) {
      stmt.run(e.deviceId, e.eventType, JSON.stringify(e.metadata || {}), e.timestamp || null);
    }
  });
  insertMany(events);
  // Assign a name to each unique device seen in this batch (outside transaction)
  const uniqueDevices = [...new Set(events.map(e => e.deviceId).filter(Boolean))];
  for (const did of uniqueDevices) {
    try { getOrAssignDeviceName(did); } catch {}
  }
}

function getAnalyticsEvents({ date, eventType, limit = 50, offset = 0 } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (date) { where += ` AND date(a.created_at) = ?`; params.push(date); }
  if (eventType) { where += ` AND a.event_type = ?`; params.push(eventType); }
  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM analytics_events WHERE device_id = a.device_id) as device_total,
      (SELECT first_name FROM device_names WHERE device_id = a.device_id) as first_name
    FROM analytics_events a
    ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM analytics_events a ${where}`)
    .get(...params).count;
  return { events: rows, total };
}

function getDeviceAnalyticsEvents(deviceId) {
  const events = db.prepare(`
    SELECT * FROM analytics_events WHERE device_id = ? ORDER BY created_at DESC LIMIT 200
  `).all(deviceId);
  const firstName = getDeviceName(deviceId);
  return { events, firstName };
}

function getAnalyticsDailySummary({ days = 14 } = {}) {
  return db.prepare(`
    SELECT date(created_at) as day,
           event_type,
           COUNT(*) as count,
           COUNT(DISTINCT device_id) as unique_devices
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY day, event_type
    ORDER BY day DESC, count DESC
  `).all(`-${days} days`);
}

function getAnalyticsStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM analytics_events').get().count;
  const today = db.prepare(`SELECT COUNT(*) as count FROM analytics_events WHERE date(created_at) = date('now')`).get().count;
  const uniqueDevices = db.prepare('SELECT COUNT(DISTINCT device_id) as count FROM analytics_events').get().count;
  const todayUniqueDevices = db.prepare(`SELECT COUNT(DISTINCT device_id) as count FROM analytics_events WHERE date(created_at) = date('now')`).get().count;
  const byType = db.prepare(`
    SELECT event_type, COUNT(*) as count, COUNT(DISTINCT device_id) as unique_devices
    FROM analytics_events GROUP BY event_type ORDER BY count DESC
  `).all();
  const todayByType = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM analytics_events WHERE date(created_at) = date('now')
    GROUP BY event_type ORDER BY count DESC
  `).all();
  return { total, today, uniqueDevices, todayUniqueDevices, byType, todayByType };
}

// ─── Push subscription helpers ───

function savePushSubscription(subscription) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, keys_p256dh, keys_auth)
    VALUES (?, ?, ?)
  `);
  stmt.run(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
}

function getAllPushSubscriptions() {
  return db.prepare('SELECT * FROM push_subscriptions').all().map(row => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.keys_p256dh, auth: row.keys_auth },
  }));
}

function removePushSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

module.exports = {
  createGeneration,
  completeGeneration,
  failGeneration,
  getGenerations,
  getGenerationsCount,
  getTopUsers,
  getStats,
  // Chat
  getOrCreateConversation,
  addMessage,
  getMessages,
  getConversationStatus,
  markReadByUser,
  markReadByAdmin,
  getAllConversations,
  setConversationStatus,
  // Push
  savePushSubscription,
  getAllPushSubscriptions,
  removePushSubscription,
  // Analytics
  insertAnalyticsEvents,
  getAnalyticsEvents,
  getDeviceAnalyticsEvents,
  getAnalyticsDailySummary,
  getAnalyticsStats,
  // Model votes
  voteForModel,
  getModelVotes,
  getVotesTodayTotal,
  hasVotedForModel,
  getDeviceVotes,
  // Device names
  getDeviceName,
  getOrAssignDeviceName,
  getAllKnownDeviceIds,
};
