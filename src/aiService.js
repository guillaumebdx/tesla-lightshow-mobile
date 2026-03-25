import { API_BASE_URL } from './apiConfig';
import { getAppCheckToken } from './firebase';
import { getDeviceId } from './deviceId';

/**
 * Call the backend to generate a light show using AI.
 * @param {Object} params
 * @param {number[]} params.waveform - Amplitude values (0-1) from waveform JSON
 * @param {number} params.durationMs - Track duration in ms
 * @param {string} [params.mood] - Optional mood: intense, chill, spooky, epic, festive, romantic
 * @param {string} [params.trackTitle] - Optional track title
 * @param {string} [params.userPrompt] - Optional user description of desired light show style
 * @returns {Promise<Object[]>} Array of event objects ready for the timeline
 */
export async function generateAIShow({ waveform, durationMs, mood, trackTitle, userPrompt }) {
  // Get App Check token (skipped in dev if not initialized)
  let headers = { 'Content-Type': 'application/json' };
  try {
    const token = await getAppCheckToken();
    if (token) headers['X-Firebase-AppCheck'] = token;
  } catch (e) {
    console.warn('[AI] App Check token unavailable:', e?.message);
    // Continue without token — backend will reject if required
  }

  // Attach stable anonymous device ID
  try {
    const deviceId = await getDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
  } catch (e) {
    console.warn('[AI] Could not get device ID', e);
  }

  const response = await fetch(`${API_BASE_URL}/api/generate-show`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      waveform: Array.isArray(waveform?.bars) ? waveform.bars : waveform,
      durationMs,
      mood: mood || 'auto',
      trackTitle: trackTitle || 'Unknown Track',
      ...(userPrompt ? { userPrompt } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${response.status})`);
  }

  const data = await response.json();

  if (!data.events || !Array.isArray(data.events)) {
    throw new Error('Invalid response from AI service');
  }

  return data.events;
}
