import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@device_id';

/**
 * Get or create a stable anonymous device ID.
 * Shared across AI generation and support chat.
 */
export async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
