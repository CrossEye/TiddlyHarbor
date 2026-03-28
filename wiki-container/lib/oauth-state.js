'use strict';

const crypto = require('crypto');

const STATE_COOKIE_NAME = 'th_oauth_state';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function getSessionSecret() {
  return process.env.WRITER_SESSION_SECRET
    || `${process.env.WIKI_NAME || 'main'}:${process.env.BASIC_AUTH_USER || 'admin'}:${process.env.BASIC_AUTH_PASS || 'change-me'}`;
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function buildOAuthStateCookie(sitePrefix, nextPath) {
  const state = crypto.randomBytes(16).toString('base64url');
  const payload = JSON.stringify({
    state,
    next: nextPath || `${sitePrefix}/`,
    expiresAt: Date.now() + STATE_MAX_AGE_MS
  });

  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = signPayload(encoded);
  const cookieValue = `${encoded}.${signature}`;

  return {
    state,
    header: `${STATE_COOKIE_NAME}=${cookieValue}; Path=${sitePrefix}/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(STATE_MAX_AGE_MS / 1000)}`
  };
}

function readOAuthStateCookie(req, sitePrefix) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith(`${STATE_COOKIE_NAME}=`));
  if (!match) {
    return null;
  }

  const rawValue = match.split('=').slice(1).join('=').trim();
  const separatorIndex = rawValue.lastIndexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const encoded = rawValue.slice(0, separatorIndex);
  const signature = rawValue.slice(separatorIndex + 1);
  const expectedSignature = signPayload(encoded);

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= Date.now()) {
      return null;
    }

    return {
      state: payload.state,
      next: payload.next || `${sitePrefix}/`
    };
  } catch {
    return null;
  }
}

function buildExpiredOAuthStateCookie(sitePrefix) {
  return `${STATE_COOKIE_NAME}=; Path=${sitePrefix}/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  buildExpiredOAuthStateCookie,
  buildOAuthStateCookie,
  readOAuthStateCookie
};
