import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './apiConfig';
import { getDeviceId } from './deviceId';

const VOTES_CACHE_KEY = '@model_votes';

/**
 * Get cached votes for this device (offline-safe).
 * @returns {Promise<string[]>} Array of car model IDs already voted for.
 */
export async function getCachedVotes() {
  try {
    const raw = await AsyncStorage.getItem(VOTES_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * Fetch this device's votes from server and cache locally.
 * Silent on failure.
 * @returns {Promise<string[]>}
 */
export async function fetchVotes() {
  try {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/votes`, {
      headers: { 'X-Device-Id': deviceId },
    });
    if (res.ok) {
      const data = await res.json();
      const votes = data.votes || [];
      await AsyncStorage.setItem(VOTES_CACHE_KEY, JSON.stringify(votes));
      return votes;
    }
  } catch {}
  return getCachedVotes();
}

/**
 * Vote for a car model. Fire-and-forget, caches optimistically.
 * @param {string} carModel
 * @returns {Promise<boolean>} true if vote was new, false if already voted
 */
export async function voteForModel(carModel) {
  try {
    // Optimistic cache update
    const cached = await getCachedVotes();
    if (cached.includes(carModel)) return false;
    cached.push(carModel);
    await AsyncStorage.setItem(VOTES_CACHE_KEY, JSON.stringify(cached));

    // Send to backend (non-blocking)
    const deviceId = await getDeviceId();
    fetch(`${API_BASE_URL}/api/votes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({ carModel }),
    }).catch(() => {});

    return true;
  } catch {
    return false;
  }
}
