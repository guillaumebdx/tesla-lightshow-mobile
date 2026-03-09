const Database = require('better-sqlite3');
const path = require('path');

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

/**
 * Insert a new generation record (called at request start).
 */
function createGeneration({ requestId, trackTitle, durationMs, mood, model, ipAddress }) {
  const stmt = db.prepare(`
    INSERT INTO generations (request_id, track_title, duration_ms, mood, model, status, ip_address)
    VALUES (?, ?, ?, ?, ?, 'processing', ?)
  `);
  const result = stmt.run(requestId, trackTitle, durationMs, mood || 'auto', model, ipAddress || '');
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

module.exports = {
  createGeneration,
  completeGeneration,
  failGeneration,
  getGenerations,
  getStats,
};
