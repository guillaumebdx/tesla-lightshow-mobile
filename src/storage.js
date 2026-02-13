import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOWS_INDEX_KEY = '@lightshows_index';
const SHOW_PREFIX = '@lightshow_';
const MAX_SHOWS = 200;

/**
 * Generate a unique ID for a new show.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Get the list of all saved show summaries (for Home screen).
 * Returns array sorted by updatedAt desc (most recent first).
 */
export async function listShows() {
  try {
    const raw = await AsyncStorage.getItem(SHOWS_INDEX_KEY);
    if (!raw) return [];
    const index = JSON.parse(raw);
    return index.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.error('listShows error:', e);
    return [];
  }
}

/**
 * Load full show data by ID.
 */
export async function loadShow(id) {
  try {
    const raw = await AsyncStorage.getItem(SHOW_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('loadShow error:', e);
    return null;
  }
}

/**
 * Create a new show. Returns the full show object.
 */
export async function createShow({ name, carModel, trackId, isBuiltinTrack }) {
  const index = await listShows();
  if (index.length >= MAX_SHOWS) {
    throw new Error(`Limite de ${MAX_SHOWS} sauvegardes atteinte`);
  }

  const now = Date.now();
  const show = {
    id: generateId(),
    name: name || `Light Show #${index.length + 1}`,
    carModel: carModel || 'model_3',
    createdAt: now,
    updatedAt: now,
    trackId: trackId || null,
    isBuiltinTrack: isBuiltinTrack !== false,
    bodyColor: '#222222',
    cursorOffsetMs: 0,
    events: [],
  };

  // Save full data
  await AsyncStorage.setItem(SHOW_PREFIX + show.id, JSON.stringify(show));

  // Update index (summary only — no events)
  const summary = {
    id: show.id,
    name: show.name,
    carModel: show.carModel,
    createdAt: show.createdAt,
    updatedAt: show.updatedAt,
    trackId: show.trackId,
    isBuiltinTrack: show.isBuiltinTrack,
    eventCount: 0,
  };
  index.push(summary);
  await AsyncStorage.setItem(SHOWS_INDEX_KEY, JSON.stringify(index));

  return show;
}

/**
 * Save show data (auto-save). Updates both full data and index summary.
 */
export async function saveShow(show) {
  try {
    const now = Date.now();
    const updated = { ...show, updatedAt: now };

    // Save full data
    await AsyncStorage.setItem(SHOW_PREFIX + updated.id, JSON.stringify(updated));

    // Update index summary
    const index = await listShows();
    const idx = index.findIndex((s) => s.id === updated.id);
    const summary = {
      id: updated.id,
      name: updated.name,
      carModel: updated.carModel,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      trackId: updated.trackId,
      isBuiltinTrack: updated.isBuiltinTrack,
      eventCount: (updated.events || []).length,
    };
    if (idx >= 0) {
      index[idx] = summary;
    } else {
      index.push(summary);
    }
    await AsyncStorage.setItem(SHOWS_INDEX_KEY, JSON.stringify(index));

    return updated;
  } catch (e) {
    console.error('saveShow error:', e);
  }
}

/**
 * Delete a show by ID.
 */
export async function deleteShow(id) {
  try {
    await AsyncStorage.removeItem(SHOW_PREFIX + id);
    const index = await listShows();
    const filtered = index.filter((s) => s.id !== id);
    await AsyncStorage.setItem(SHOWS_INDEX_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('deleteShow error:', e);
  }
}

/**
 * Duplicate a show. Returns the new show object.
 */
export async function duplicateShow(id) {
  const original = await loadShow(id);
  if (!original) throw new Error('Show introuvable');

  const index = await listShows();
  if (index.length >= MAX_SHOWS) {
    throw new Error(`Limite de ${MAX_SHOWS} sauvegardes atteinte`);
  }

  const now = Date.now();
  const newShow = {
    ...original,
    id: generateId(),
    name: original.name + ' (copie)',
    createdAt: now,
    updatedAt: now,
  };

  await AsyncStorage.setItem(SHOW_PREFIX + newShow.id, JSON.stringify(newShow));

  const summary = {
    id: newShow.id,
    name: newShow.name,
    carModel: newShow.carModel,
    createdAt: newShow.createdAt,
    updatedAt: newShow.updatedAt,
    trackId: newShow.trackId,
    isBuiltinTrack: newShow.isBuiltinTrack,
    eventCount: (newShow.events || []).length,
  };
  index.push(summary);
  await AsyncStorage.setItem(SHOWS_INDEX_KEY, JSON.stringify(index));

  return newShow;
}

/**
 * Get the count of existing shows (for naming new ones).
 */
export async function getShowCount() {
  const index = await listShows();
  return index.length;
}
