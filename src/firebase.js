import appCheck from '@react-native-firebase/app-check';

let initialized = false;

/**
 * Initialize Firebase App Check.
 * Uses Play Integrity on Android and App Attest on iOS.
 * In __DEV__ mode, uses the debug provider for local testing.
 */
export async function initAppCheck() {
  if (initialized) return;

  const provider = appCheck().newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {
      provider: __DEV__ ? 'debug' : 'playIntegrity',
    },
    apple: {
      provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
    },
  });

  await appCheck().initializeAppCheck({
    provider,
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
}

/**
 * Get a valid App Check token to attach to backend requests.
 * @returns {Promise<string>} The App Check token string.
 */
export async function getAppCheckToken() {
  if (!initialized) {
    await initAppCheck();
  }
  const { token } = await appCheck().getToken(false);
  return token;
}
