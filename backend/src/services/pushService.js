const webpush = require('web-push');

let isConfigured = false;

/**
 * Initialize web-push with VAPID keys from environment.
 */
function initPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@lightstudio.harari.ovh';

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys not configured — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isConfigured = true;
  console.log('[Push] Web Push configured');
}

/**
 * Send a push notification to a subscription.
 * @param {Object} subscription - PushSubscription object { endpoint, keys: { p256dh, auth } }
 * @param {Object} payload - { title, body, badge, data }
 * @returns {Promise<boolean>} true if sent, false if failed
 */
async function sendPush(subscription, payload) {
  if (!isConfigured) return false;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60, // 1 hour
      urgency: 'high',
    });
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or invalid — caller should remove it
      console.log('[Push] Subscription expired:', subscription.endpoint.slice(0, 60));
      return false;
    }
    console.error('[Push] Send error:', err.message);
    return false;
  }
}

/**
 * Get the VAPID public key for client-side subscription.
 */
function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

module.exports = { initPush, sendPush, getVapidPublicKey };
