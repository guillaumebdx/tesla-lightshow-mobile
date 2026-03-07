import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  getToken,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

let appCheckInstance = null;

/**
 * Initialize Firebase App Check.
 * Uses Play Integrity on Android and App Attest on iOS.
 * In __DEV__ mode, uses the debug provider for local testing.
 */
export async function initAppCheck() {
  if (appCheckInstance) return;

  const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();
  rnfbProvider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
    },
  });

  appCheckInstance = initializeAppCheck(getApp(), {
    provider: rnfbProvider,
    isTokenAutoRefreshEnabled: true,
  });
}

/**
 * Get a valid App Check token to attach to backend requests.
 * @returns {Promise<string>} The App Check token string.
 */
export async function getAppCheckToken() {
  if (!appCheckInstance) {
    await initAppCheck();
  }
  const { token } = await getToken(appCheckInstance, /* forceRefresh */ false);
  return token;
}
