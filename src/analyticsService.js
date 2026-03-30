import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './apiConfig';
import { getDeviceId } from './deviceId';

const QUEUE_KEY = '@analytics_queue';
const FLUSH_INTERVAL_MS = 30000; // 30 seconds
const MAX_QUEUE_SIZE = 200;

let queue = [];
let flushTimer = null;
let isFlushing = false;

/**
 * Track an analytics event. Fire-and-forget — never throws, never blocks.
 * @param {string} eventType - One of: show_created, fseq_exported, music_selected
 * @param {Object} [metadata={}] - Additional data (carModel, trackTitle, isBuiltin, withDemo...)
 */
export function trackEvent(eventType, metadata = {}) {
  try {
    queue.push({
      eventType,
      metadata,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });

    // Trim if too large (drop oldest)
    if (queue.length > MAX_QUEUE_SIZE) {
      queue = queue.slice(-MAX_QUEUE_SIZE);
    }

    // Persist queue (async, don't await)
    _saveQueue();

    // Start flush timer if not already running
    _ensureFlushTimer();
  } catch (_) {
    // Never throw — analytics must be invisible
  }
}

/**
 * Initialize analytics: restore queued events from storage and start flush loop.
 * Call once at app startup.
 */
export async function initAnalytics() {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        queue = parsed.concat(queue);
      }
    }
  } catch (_) {}

  _ensureFlushTimer();

  // Attempt an immediate flush
  _flush();
}

/**
 * Force flush (e.g., on app background). Returns silently on failure.
 */
export async function flushAnalytics() {
  await _flush();
}

// --- Internal ---

function _ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);
}

async function _saveQueue() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {}
}

async function _flush() {
  if (isFlushing || queue.length === 0) return;
  isFlushing = true;

  try {
    const deviceId = await getDeviceId();
    // Take a snapshot of events to send
    const batch = queue.slice(0, 50);

    const res = await fetch(`${API_BASE_URL}/api/analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({ events: batch }),
    });

    if (res.ok) {
      // Remove sent events from queue
      queue = queue.slice(batch.length);
      await _saveQueue();
    }
    // On non-ok response, keep events in queue for next retry
  } catch (_) {
    // Network error / offline — events stay in queue, will retry next interval
  } finally {
    isFlushing = false;
  }
}
