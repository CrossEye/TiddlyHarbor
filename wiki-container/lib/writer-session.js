const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'th_writer_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret() {
  return process.env.WRITER_SESSION_SECRET
    || `${process.env.WIKI_NAME || 'main'}:${process.env.BASIC_AUTH_USER || 'admin'}:${process.env.BASIC_AUTH_PASS || 'change-me'}`;
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function normalizeRole(role) {
  return role === 'admin' || role === 'reader' || role === 'writer' || role === 'pending'
    ? role
    : 'writer';
}

function createWriterSessionCookie(user) {
  const safeUsername = (user && user.username && String(user.username).trim()) ? String(user.username) : 'writer';
  const safeRole = normalizeRole(user && user.role);
  const payload = JSON.stringify({
    username: safeUsername,
    role: safeRole,
    expiresAt: Date.now() + SESSION_MAX_AGE_MS
  });
  const encodedPayload = encodeBase64Url(payload);
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    cookies[key] = value;
    return cookies;
  }, {});
}

function getWriterSession(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const rawValue = cookies[SESSION_COOKIE_NAME];
  if (!rawValue) {
    return null;
  }

  const separatorIndex = rawValue.lastIndexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const encodedPayload = rawValue.slice(0, separatorIndex);
  const signature = rawValue.slice(separatorIndex + 1);
  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedSignatureBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= Date.now()) {
      return null;
    }

    return {
      username: typeof payload.username === 'string' && payload.username.trim()
        ? payload.username
        : 'writer',
      role: normalizeRole(payload.role),
      expiresAt: payload.expiresAt
    };
  } catch {
    return null;
  }
}

function hasValidWriterSession(req) {
  return Boolean(getWriterSession(req));
}

function buildSessionCookieHeader(sitePrefix, user) {
  return `${SESSION_COOKIE_NAME}=${createWriterSessionCookie(user)}; Path=${sitePrefix}/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`;
}

function buildExpiredSessionCookieHeader(sitePrefix) {
  return `${SESSION_COOKIE_NAME}=; Path=${sitePrefix}/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  SESSION_COOKIE_NAME,
  buildExpiredSessionCookieHeader,
  buildSessionCookieHeader,
  getWriterSession,
  hasValidWriterSession
};