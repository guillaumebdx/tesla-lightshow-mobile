# Firebase Setup — LightShow Studio

## Overview

Firebase is used in this project for **App Check** only (for now). App Check protects backend API calls (future AI light show generation) by verifying that requests come from the genuine app, without requiring user authentication.

## Packages

| Package | Purpose |
|---------|---------|
| `@react-native-firebase/app` | Firebase core — required by all Firebase modules |
| `@react-native-firebase/app-check` | App Check — token-based app attestation |

Installed via:
```bash
npx expo install @react-native-firebase/app @react-native-firebase/app-check
```

## Firebase Console Config

**Project:** `light-studio-app`

### App Check Providers

| Platform | Provider | Status |
|----------|----------|--------|
| Android (`com.guillaumebdx.tesla3dviewer`) | Play Integrity | ✅ Registered |
| iOS (`com.guillaumebdx.lightstudiofortesla`) | App Attest | ✅ Registered |

### Service Files

| File | Platform | Location |
|------|----------|----------|
| `google-services.json` | Android | Project root |
| `GoogleService-Info.plist` | iOS | Project root |

Both are referenced in `app.json`:
```json
{
  "ios": { "googleServicesFile": "./GoogleService-Info.plist" },
  "android": { "googleServicesFile": "./google-services.json" }
}
```

## Expo Config Plugins

In `app.json` → `plugins`:
```json
[
  "expo-asset",
  "@react-native-firebase/app",
  "@react-native-firebase/app-check"
]
```

These config plugins handle all native iOS/Android setup automatically (AppDelegate, build.gradle, etc.) — no manual native code changes needed.

## App Check Initialization

**File:** `src/firebase.js`

### How it works

1. On app startup (`App.js` → `useEffect`), `initAppCheck()` is called
2. A `ReactNativeFirebaseAppCheckProvider` is created and configured:
   - **Android prod** → Play Integrity
   - **iOS prod** → App Attest with DeviceCheck fallback
   - **Dev mode** (`__DEV__`) → Debug provider
3. `initializeAppCheck()` registers the provider with Firebase
4. Tokens auto-refresh in the background

### Exported functions

| Function | Returns | Usage |
|----------|---------|-------|
| `initAppCheck()` | `Promise<void>` | Called once at app startup |
| `getAppCheckToken()` | `Promise<string>` | Call before each backend API request |

### Usage example (future AI endpoint)

```javascript
import { getAppCheckToken } from './src/firebase';

async function generateLightShow(waveform, mood, duration) {
  const token = await getAppCheckToken();
  const response = await fetch('https://your-backend.com/api/generate-show', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': token,
    },
    body: JSON.stringify({ waveform, mood, duration }),
  });
  return response.json();
}
```

### Backend verification

On your backend (Cloud Function, Express, etc.), verify the token:

```javascript
const { getAppCheck } = require('firebase-admin/app-check');

async function verifyAppCheckToken(req, res, next) {
  const token = req.headers['x-firebase-appcheck'];
  if (!token) return res.status(401).json({ error: 'Missing App Check token' });

  try {
    await getAppCheck().verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid App Check token' });
  }
}
```

## Debug Mode (Development)

In `__DEV__` mode, App Check uses the **debug provider**. On first run, a debug token is printed in the console logs. You must add this token to the Firebase Console:

1. Run the app in dev mode
2. Copy the debug token from logs
3. Go to Firebase Console → App Check → Apps → Manage debug tokens
4. Add the token

## Important Notes

- **Requires native rebuild** — Firebase is a native module. After installation, run `npx expo run:android` or `npx expo run:ios` (not `npx expo start`).
- **Not compatible with Expo Go** — Must use a dev client or production build.
- **No user auth required** — App Check validates the *app*, not the *user*.
- **Token lifetime** — Tokens are valid for ~1 hour and auto-refresh.
