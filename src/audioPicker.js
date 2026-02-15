/**
 * Audio file picker + import for React Native / Expo.
 * Picks an MP3 from the device, copies it to app storage, generates waveform.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { generateWaveform } from './waveformGenerator';

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const AUDIO_DIR = FileSystem.documentDirectory + 'audio/';
const RELATIVE_PREFIX = 'audio/';

/**
 * Ensure the audio directory exists.
 */
async function ensureAudioDir() {
  const info = await FileSystem.getInfoAsync(AUDIO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  }
}

/**
 * Resolve an audio URI (relative or legacy absolute) to a current absolute URI.
 * Handles the iOS container UUID change on app updates.
 */
export function resolveAudioUri(uri) {
  if (!uri) return uri;
  // Already a relative path (new format)
  if (uri.startsWith(RELATIVE_PREFIX)) {
    return FileSystem.documentDirectory + uri;
  }
  // Legacy absolute URI — extract the filename after /audio/
  const audioIdx = uri.indexOf('/audio/');
  if (audioIdx !== -1) {
    const relativePart = uri.substring(audioIdx + 1); // 'audio/filename.mp3'
    return FileSystem.documentDirectory + relativePart;
  }
  // Fallback: return as-is
  return uri;
}

/**
 * Convert an absolute URI to a relative path for storage.
 */
function toRelativePath(absoluteUri) {
  const audioIdx = absoluteUri.indexOf('/audio/');
  if (audioIdx !== -1) {
    return absoluteUri.substring(audioIdx + 1); // 'audio/filename.mp3'
  }
  return absoluteUri;
}

/**
 * Pick an MP3 file from the device.
 * Returns null if cancelled.
 * Returns { uri, name, waveform, duration } on success.
 */
export async function pickAndImportAudio(onProgress) {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/mpeg',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const fileName = asset.name || `import_${Date.now()}.mp3`;

  if (onProgress) onProgress('Copying file...');

  // Copy to persistent app storage
  await ensureAudioDir();
  const destUri = AUDIO_DIR + fileName;

  // Check if file already exists (same name)
  const existing = await FileSystem.getInfoAsync(destUri);
  if (!existing.exists) {
    await FileSystem.copyAsync({ from: asset.uri, to: destUri });
  }

  // Check duration before heavy waveform analysis
  if (onProgress) onProgress('Checking duration...');
  const { sound: probe, status: probeStatus } = await Audio.Sound.createAsync(
    { uri: destUri },
    { shouldPlay: false }
  );
  const durationMs = probeStatus.durationMillis || 0;
  await probe.unloadAsync();

  if (durationMs > MAX_DURATION_MS) {
    // Clean up the copied file
    await FileSystem.deleteAsync(destUri, { idempotent: true });
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    throw new Error(`DURATION_TOO_LONG:${mins}:${secs.toString().padStart(2, '0')}`);
  }

  if (onProgress) onProgress('Audio analysis...');

  // Wait 600ms so the loader animation has time to render and build up
  // before the synchronous MP3 decode blocks the JS thread
  await new Promise(resolve => setTimeout(resolve, 600));

  // Generate waveform (decode is sync/blocking)
  const waveform = await generateWaveform(destUri);

  // Save waveform cache alongside the audio file
  const waveformUri = destUri.replace('.mp3', '.waveform.json');
  await FileSystem.writeAsStringAsync(waveformUri, JSON.stringify(waveform));

  return {
    uri: toRelativePath(destUri),
    name: fileName.replace('.mp3', ''),
    waveform,
    duration: waveform.duration,
  };
}

/**
 * Load a cached waveform for an imported audio file.
 * Returns the waveform object or null.
 */
export async function loadCachedWaveform(audioUri) {
  try {
    const resolved = resolveAudioUri(audioUri);
    const waveformUri = resolved.replace('.mp3', '.waveform.json');
    const info = await FileSystem.getInfoAsync(waveformUri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(waveformUri);
    return JSON.parse(raw);
  } catch (e) {
    console.error('loadCachedWaveform error:', e);
    return null;
  }
}

/**
 * Delete an imported audio file and its waveform cache.
 */
export async function deleteImportedAudio(audioUri) {
  try {
    const resolved = resolveAudioUri(audioUri);
    await FileSystem.deleteAsync(resolved, { idempotent: true });
    const waveformUri = resolved.replace('.mp3', '.waveform.json');
    await FileSystem.deleteAsync(waveformUri, { idempotent: true });
  } catch (e) {
    console.error('deleteImportedAudio error:', e);
  }
}
