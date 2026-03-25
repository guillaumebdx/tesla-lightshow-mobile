import { API_BASE_URL } from './apiConfig';
import { getAppCheckToken } from './firebase';
import { getDeviceId } from './deviceId';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_SENT_KEY = '@chat_has_sent';

/**
 * Build common headers for chat API calls.
 */
async function chatHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = await getAppCheckToken();
    if (token) headers['X-Firebase-AppCheck'] = token;
  } catch (e) {
    console.warn('[Chat] App Check token unavailable:', e?.message);
  }
  try {
    const deviceId = await getDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
  } catch (e) {
    console.warn('[Chat] Could not get device ID', e);
  }
  return headers;
}

/**
 * Get device info for the first message context.
 */
export function getDeviceInfo() {
  return {
    os: Platform.OS,
    osVersion: Platform.Version?.toString() || '',
    appVersion: '1.11.0',
    lang: '', // will be set by caller from i18n
  };
}

/**
 * Send a message to the support chat.
 */
export async function sendMessage(content, deviceInfo) {
  const headers = await chatHeaders();
  const res = await fetch(`${API_BASE_URL}/api/chat/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, deviceInfo }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${res.status})`);
  }
  // Mark that user has sent at least one message
  await AsyncStorage.setItem(CHAT_SENT_KEY, '1');
  return res.json();
}

/**
 * Fetch messages, optionally since a message ID.
 * @param {number|null} sinceId - Last seen message ID (integer), or null for all.
 */
export async function fetchMessages(sinceId) {
  const headers = await chatHeaders();
  const url = `${API_BASE_URL}/api/chat/messages` + (sinceId ? `?since_id=${sinceId}` : '');
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${res.status})`);
  }
  return res.json();
}

/**
 * Lightweight status check — returns { exists, unread, status }.
 */
export async function fetchChatStatus() {
  const headers = await chatHeaders();
  const res = await fetch(`${API_BASE_URL}/api/chat/status`, { headers });
  if (!res.ok) return { exists: false, unread: 0 };
  return res.json();
}

/**
 * Check if user has ever sent a message (local flag, no network).
 */
export async function hasEverSentMessage() {
  const val = await AsyncStorage.getItem(CHAT_SENT_KEY);
  return val === '1';
}
