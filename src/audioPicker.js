/**
 * Audio file picker + import for React Native / Expo.
 * Picks an MP3 from the device, copies it to app storage, generates waveform.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { generateWaveform } from './waveformGenerator';

const AUDIO_DIR = FileSystem.documentDirectory + 'audio/';

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
    uri: destUri,
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
    const waveformUri = audioUri.replace('.mp3', '.waveform.json');
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
    await FileSystem.deleteAsync(audioUri, { idempotent: true });
    const waveformUri = audioUri.replace('.mp3', '.waveform.json');
    await FileSystem.deleteAsync(waveformUri, { idempotent: true });
  } catch (e) {
    console.error('deleteImportedAudio error:', e);
  }
}
