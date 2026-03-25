const crypto = require('crypto');

/**
 * Simple admin authentication middleware.
 * Uses ADMIN_PASSWORD from .env, stored as a hashed cookie.
 */

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function adminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const expectedHash = hashPassword(adminPassword);

  // Check cookie
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.admin_token === expectedHash) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Login route handler — sets the admin cookie.
 */
function adminLogin(req, res) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const { password } = req.body || {};
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const hash = hashPassword(adminPassword);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `admin_token=${hash}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=315360000${secure}`);
  res.json({ ok: true });
}

/**
 * Check if currently authenticated (for frontend redirect logic).
 */
function adminCheck(req, res) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return res.json({ authenticated: false });

  const cookies = parseCookies(req.headers.cookie || '');
  const expectedHash = hashPassword(adminPassword);
  res.json({ authenticated: cookies.admin_token === expectedHash });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach((c) => {
    const [key, ...rest] = c.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });
  return cookies;
}

module.exports = { adminAuth, adminLogin, adminCheck };
