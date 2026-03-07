const admin = require('firebase-admin');

/**
 * Initialize Firebase Admin SDK.
 * Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON.
 */
function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });

  console.log('✅ Firebase Admin initialized');
}

/**
 * Express middleware to verify Firebase App Check tokens.
 * Expects header: X-Firebase-AppCheck: <token>
 */
async function verifyAppCheck(req, res, next) {
  // Skip in development if no token provided
  if (process.env.NODE_ENV === 'development' && !req.headers['x-firebase-appcheck']) {
    console.warn('⚠️  Dev mode: skipping App Check verification');
    return next();
  }

  const token = req.headers['x-firebase-appcheck'];
  if (!token) {
    return res.status(401).json({ error: 'Missing App Check token' });
  }

  try {
    await admin.appCheck().verifyToken(token);
    next();
  } catch (err) {
    console.error('[AppCheck] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid App Check token' });
  }
}

module.exports = { initFirebaseAdmin, verifyAppCheck };
