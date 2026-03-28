const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { renderAdminPage, renderWriterLoginPage } = require('./lib/auth-pages');
const { startTiddlyWiki } = require('./lib/tw-process');
const { requireBasicWriteAuth } = require('./lib/write-guard');
const { buildExpiredSessionCookieHeader, buildSessionCookieHeader, getWriterSession, hasValidWriterSession } = require('./lib/writer-session');
const { GitSync } = require('./lib/git-sync');
const { hasAdminAccess, hasWriteAccess, UserStore } = require('./lib/user-store');
const { getEnabledProviders } = require('./lib/oauth-config');
const { initializeStrategies, passport } = require('./lib/oauth-strategies');
const { buildExpiredOAuthStateCookie, buildOAuthStateCookie, readOAuthStateCookie } = require('./lib/oauth-state');
const tiddlyWikiVersion = require('tiddlywiki/package.json').version;

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();

const publicPort = Number(process.env.PORT || 8080);
const twPort = Number(process.env.TW_INTERNAL_PORT || 8081);
const wikiPath = process.env.WIKI_PATH || path.join(__dirname, 'wiki');
const wikiName = process.env.WIKI_NAME || 'main';
const sitePrefix = `/${wikiName}`;

const userStore = new UserStore({
  dbPath: process.env.AUTH_DB_PATH || path.join(wikiPath, '.tiddlyharbor', 'auth.sqlite3'),
  bootstrapUsername: process.env.BASIC_AUTH_USER || 'admin',
  bootstrapPassword: process.env.BASIC_AUTH_PASS || 'change-me'
});

try {
  userStore.initialize();
} catch (err) {
  console.error('UserStore initialization failed:', err.message);
}

const enabledOAuthProviders = getEnabledProviders();
if (enabledOAuthProviders.length > 0) {
  initializeStrategies(enabledOAuthProviders, sitePrefix);
  console.log(`OAuth providers enabled: ${enabledOAuthProviders.map((p) => p.name).join(', ')}`);
} else {
  console.log('No OAuth providers configured — password-only auth');
}

const gitSync = new GitSync(wikiPath, {
  enabled: process.env.GIT_AUTOSAVE_ENABLED !== 'false',
  autoPush: process.env.GIT_AUTOPUSH === 'true',
  quiescenceMs: Number(process.env.QUIESCENCE_MINUTES || 5) * 60 * 1000,
  maxIntervalMs: Number(process.env.MAX_COMMIT_INTERVAL_MINUTES || 60) * 60 * 1000,
  remoteUrl: process.env.GIT_REMOTE_URL || '',
  wikiName
});

gitSync.initialize().catch((err) => {
  console.error('GitSync initialization failed:', err.message);
});

const twProcess = startTiddlyWiki(wikiPath, twPort, wikiName);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(passport.initialize());

function getRequesterIp(req) {
  const xff = req.get('X-Forwarded-For');
  if (xff) {
    return xff.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function auditAdminAction({ req, actor, action, targetUsername, outcome, detail }) {
  const payload = {
    event: 'admin_user_mgmt',
    ts: new Date().toISOString(),
    wikiName,
    actor: actor || 'anonymous',
    action,
    targetUsername: targetUsername || null,
    outcome,
    detail: detail || null,
    method: req.method,
    path: req.originalUrl,
    ip: getRequesterIp(req)
  };

  console.log(`[ADMIN_AUDIT] ${JSON.stringify(payload)}`);
}

function isSelfAction(req) {
  const actor = req.writerSession?.username;
  const target = req.params?.username;
  return Boolean(actor && target && actor === target);
}

function isSelfUser(req, username) {
  const actor = req.writerSession?.username;
  return Boolean(actor && username && actor === username);
}

function requireAdminSession(req, res, next) {
  const session = getWriterSession(req);
  if (!session) {
    auditAdminAction({
      req,
      actor: null,
      action: 'require-admin-session',
      targetUsername: req.params?.username,
      outcome: 'denied',
      detail: 'no-session'
    });
    return res.status(401).json({
      error: 'writer-login-required',
      message: 'Login required.',
      loginPath: `${sitePrefix}/login`
    });
  }

  if (!hasAdminAccess(session.role)) {
    auditAdminAction({
      req,
      actor: session.username,
      action: 'require-admin-session',
      targetUsername: req.params?.username,
      outcome: 'denied',
      detail: `insufficient-role:${session.role}`
    });
    return res.status(403).json({
      error: 'admin-role-required',
      message: 'Admin role required.',
      requiredRole: 'admin'
    });
  }

  req.writerSession = session;
  return next();
}

function requireAdminPageSession(req, res, next) {
  const session = getWriterSession(req);
  if (!session) {
    const nextPath = encodeURIComponent(`${sitePrefix}/admin`);
    return res.redirect(`${sitePrefix}/login?next=${nextPath}`);
  }

  if (!hasAdminAccess(session.role)) {
    auditAdminAction({
      req,
      actor: session.username,
      action: 'admin-page-access',
      targetUsername: null,
      outcome: 'denied',
      detail: `insufficient-role:${session.role}`
    });

    return res.status(403).send('Admin role required.');
  }

  req.writerSession = session;
  return next();
}

function parseBooleanInput(value) {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

function redirectAdminPage(res, params = {}) {
  const query = new URLSearchParams();
  if (params.msg) {
    query.set('msg', params.msg);
  }
  if (params.err) {
    query.set('err', params.err);
  }

  const suffix = query.toString();
  return res.redirect(suffix ? `${sitePrefix}/admin?${suffix}` : `${sitePrefix}/admin`);
}

function getEffectivePath(req) {
  if (req.path === sitePrefix) {
    return '/';
  }

  if (req.path.startsWith(sitePrefix + '/')) {
    return req.path.slice(sitePrefix.length);
  }

  return req.path;
}

function extractTiddlerTitle(effectivePath) {
  const match = effectivePath.match(/^\/recipes\/[^/]+\/tiddlers\/([^/]+)$/);
  if (!match) {
    return null;
  }

  let title = match[1];
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(title);
      if (decoded === title) {
        break;
      }
      title = decoded;
    } catch {
      break;
    }
  }

  return title;
}

function isBenignStateWritePath(effectivePath) {
  const title = extractTiddlerTitle(effectivePath);
  if (!title) {
    return false;
  }

  if (title.includes('StoryList') || title.includes('HistoryList')) {
    return true;
  }

  if (title.startsWith('Draft of ') || title.startsWith('$:/Draft')) {
    return true;
  }

  return title === '$:/StoryList'
    || title === '$:/HistoryList'
    || title.startsWith('$:/state/')
    || title.startsWith('$:/temp/');
}

function authenticateWriter(username, password) {
  return userStore.validateCredentials(username, password);
}

function isTiddlyWikiSyncRequest(req) {
  const requestedWith = req.get('X-Requested-With') || '';
  const accept = req.get('Accept') || '';
  return requestedWith === 'TiddlyWiki' || accept.includes('application/json');
}

function getStatusPayload(req) {
  const session = getWriterSession(req);
  const authenticated = Boolean(session);
  const canWrite = authenticated && hasWriteAccess(session.role);

  return {
    username: authenticated ? session.username : 'GUEST',
    role: authenticated ? session.role : 'guest',
    anonymous: !authenticated,
    read_only: !canWrite,
    'user-role': authenticated ? session.role : 'anonymous',
    wiki_version: gitSync.getCachedVersion(),
    logout_is_available: true,
    space: {
      recipe: 'default'
    },
    tiddlywiki_version: tiddlyWikiVersion
  };
}

function getSafeNextPath(rawNext) {
  if (!rawNext || typeof rawNext !== 'string') {
    return `${sitePrefix}/`;
  }

  if (!rawNext.startsWith('/')) {
    return `${sitePrefix}/`;
  }

  if (rawNext === sitePrefix || rawNext.startsWith(`${sitePrefix}/`)) {
    return rawNext;
  }

  return `${sitePrefix}/`;
}

function completeWriterLogin(req, res, nextPath, user) {
  res.setHeader('Set-Cookie', buildSessionCookieHeader(sitePrefix, user));

  if (isTiddlyWikiSyncRequest(req)) {
    return res.status(204).end();
  }

  return res.redirect(getSafeNextPath(nextPath));
}

function completeWriterLogout(req, res, nextPath) {
  res.setHeader('Set-Cookie', buildExpiredSessionCookieHeader(sitePrefix));

  if (isTiddlyWikiSyncRequest(req)) {
    return res.status(204).end();
  }

  return res.redirect(getSafeNextPath(nextPath));
}

app.get([`${sitePrefix}/login`, '/login'], (req, res) => {
  const nextPath = getSafeNextPath(req.query.next || `${sitePrefix}/`);

  if (hasValidWriterSession(req)) {
    return res.redirect(nextPath);
  }

  const errorMessages = {
    invalid: 'Incorrect username or password.',
    oauth: 'OAuth sign-in failed. Please try again.',
    disabled: 'Your account is disabled. Contact an admin.',
    pending: 'Your account is pending admin approval.'
  };

  return res.status(200).send(renderWriterLoginPage({
    wikiName,
    sitePrefix,
    nextPath,
    enabledProviders: enabledOAuthProviders,
    errorMessage: errorMessages[req.query.error] || ''
  }));
});

app.post([`${sitePrefix}/login`, '/login'], (req, res) => {
  const nextPath = getSafeNextPath(req.body?.next || req.query.next || `${sitePrefix}/`);
  const username = req.body?.username || '';
  const password = req.body?.password || '';
  const user = authenticateWriter(username, password);

  if (!user) {
    return res.status(401).send(renderWriterLoginPage({
      wikiName,
      sitePrefix,
      nextPath,
      errorMessage: 'Incorrect username or password.'
    }));
  }

  return completeWriterLogin(req, res, nextPath, user);
});

app.post([`${sitePrefix}/challenge/tiddlywebplugins.tiddlyspace.cookie_form`, '/challenge/tiddlywebplugins.tiddlyspace.cookie_form'], (req, res) => {
  const username = req.body?.user || req.body?.username || '';
  const password = req.body?.password || '';
  const user = authenticateWriter(username, password);

  if (!user) {
    return res.status(401).json({
      error: 'invalid-credentials',
      message: 'Incorrect username or password.'
    });
  }

  return completeWriterLogin(req, res, req.body?.tiddlyweb_redirect || req.query.tiddlyweb_redirect || `${sitePrefix}/`, user);
});

app.post([`${sitePrefix}/logout`, '/logout'], (req, res) => {
  return completeWriterLogout(req, res, req.body?.next || req.query.next || `${sitePrefix}/`);
});

app.get([`${sitePrefix}/logout`, '/logout'], (req, res) => {
  return completeWriterLogout(req, res, req.query.next || `${sitePrefix}/`);
});

// ── OAuth routes ──────────────────────────────────────────────────────────

app.get([`${sitePrefix}/auth/:provider`, '/auth/:provider'], (req, res, next) => {
  const providerName = req.params.provider;
  const provider = enabledOAuthProviders.find((p) => p.name === providerName);
  if (!provider) {
    return res.status(404).send('OAuth provider not configured.');
  }

  const nextPath = getSafeNextPath(req.query.next || `${sitePrefix}/`);
  const stateCookie = buildOAuthStateCookie(sitePrefix, nextPath);

  res.setHeader('Set-Cookie', stateCookie.header);

  return passport.authenticate(providerName, {
    session: false,
    state: stateCookie.state,
    scope: provider.scope || []
  })(req, res, next);
});

app.get([`${sitePrefix}/auth/:provider/callback`, '/auth/:provider/callback'], (req, res, next) => {
  const providerName = req.params.provider;
  const provider = enabledOAuthProviders.find((p) => p.name === providerName);
  if (!provider) {
    return res.status(404).send('OAuth provider not configured.');
  }

  const savedState = readOAuthStateCookie(req, sitePrefix);
  if (!savedState || savedState.state !== req.query.state) {
    return res.status(403).send('OAuth state mismatch — please try again.');
  }

  passport.authenticate(providerName, { session: false }, (err, oauthProfile) => {
    // Clear the state cookie regardless of outcome
    res.setHeader('Set-Cookie', buildExpiredOAuthStateCookie(sitePrefix));

    if (err || !oauthProfile) {
      console.error(`OAuth callback error (${providerName}):`, err?.message || 'no profile');
      return res.redirect(`${sitePrefix}/login?error=oauth`);
    }

    // Look up or create the user
    let user = userStore.findByOAuth(oauthProfile.provider, oauthProfile.oauthId);
    if (!user) {
      try {
        user = userStore.createOAuthUser({
          provider: oauthProfile.provider,
          oauthId: oauthProfile.oauthId,
          email: oauthProfile.email,
          displayName: oauthProfile.displayName
        });
        console.log(`New OAuth user created: ${user.username} (${oauthProfile.provider}) — pending approval`);
      } catch (createErr) {
        console.error(`Failed to create OAuth user:`, createErr.message);
        return res.redirect(`${sitePrefix}/login?error=oauth`);
      }
    }

    if (!user.isActive) {
      return res.redirect(`${sitePrefix}/login?error=disabled`);
    }

    if (user.role === 'pending') {
      return res.redirect(`${sitePrefix}/login?error=pending`);
    }

    // Set session cookie and redirect
    return completeWriterLogin(req, res, savedState.next, {
      username: user.username,
      role: user.role
    });
  })(req, res, next);
});

app.get([`${sitePrefix}/status`, '/status'], (req, res) => {
  res.json(getStatusPayload(req));
});

app.get([`${sitePrefix}/auth/status`, '/auth/status'], (req, res) => {
  const session = getWriterSession(req);
  res.json({
    ok: true,
    wikiName,
    authenticated: Boolean(session),
    username: session ? session.username : null,
    role: session ? session.role : null,
    canWrite: session ? hasWriteAccess(session.role) : false,
    loginPath: `${sitePrefix}/login`,
    logoutPath: `${sitePrefix}/logout`
  });
});

app.get([`${sitePrefix}/admin`, '/admin'], requireAdminPageSession, (req, res) => {
  const users = userStore.listUsers();
  auditAdminAction({
    req,
    actor: req.writerSession.username,
    action: 'admin-page-view',
    targetUsername: null,
    outcome: 'success',
    detail: `count:${users.length}`
  });

  return res.status(200).send(renderAdminPage({
    wikiName,
    sitePrefix,
    currentUser: req.writerSession,
    users,
    message: req.query.msg || '',
    errorMessage: req.query.err || ''
  }));
});

app.post([`${sitePrefix}/admin`, '/admin'], requireAdminPageSession, (req, res) => {
  const action = String(req.body?.action || '').trim();
  const username = String(req.body?.username || '').trim();

  try {
    if (action === 'create-user') {
      const user = userStore.createUser({
        username,
        password: req.body?.password,
        role: req.body?.role
      });
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'create-user',
        targetUsername: user.username,
        outcome: 'success',
        detail: `role:${user.role}`
      });
      return redirectAdminPage(res, { msg: `Created user ${user.username}` });
    }

    if (action === 'set-role') {
      const requestedRole = String(req.body?.role || '').trim().toLowerCase();
      if (isSelfUser(req, username) && requestedRole && requestedRole !== 'admin') {
        auditAdminAction({
          req,
          actor: req.writerSession.username,
          action: 'set-role',
          targetUsername: username,
          outcome: 'failed',
          detail: 'self-demotion-blocked'
        });
        return redirectAdminPage(res, { err: 'You cannot demote your own admin role.' });
      }

      const user = userStore.setRole(username, req.body?.role);
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'set-role',
        targetUsername: user.username,
        outcome: 'success',
        detail: `role:${user.role}`
      });
      return redirectAdminPage(res, { msg: `Updated role for ${user.username} to ${user.role}` });
    }

    if (action === 'set-active') {
      const isActive = parseBooleanInput(req.body?.isActive);
      if (isSelfUser(req, username) && isActive === false) {
        auditAdminAction({
          req,
          actor: req.writerSession.username,
          action: 'set-active',
          targetUsername: username,
          outcome: 'failed',
          detail: 'self-disable-blocked'
        });
        return redirectAdminPage(res, { err: 'You cannot disable your own admin account.' });
      }

      if (typeof isActive !== 'boolean') {
        auditAdminAction({
          req,
          actor: req.writerSession.username,
          action: 'set-active',
          targetUsername: username,
          outcome: 'failed',
          detail: 'invalid-isActive'
        });
        return redirectAdminPage(res, { err: 'isActive must be true or false.' });
      }

      const user = userStore.setActive(username, isActive);
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'set-active',
        targetUsername: user.username,
        outcome: 'success',
        detail: `isActive:${user.isActive}`
      });
      return redirectAdminPage(res, { msg: `Set ${user.username} to ${user.isActive ? 'active' : 'disabled'}` });
    }

    if (action === 'set-password') {
      const user = userStore.setPassword(username, req.body?.password);
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'set-password',
        targetUsername: user.username,
        outcome: 'success',
        detail: 'password-updated'
      });
      return redirectAdminPage(res, { msg: `Updated password for ${user.username}` });
    }

    if (action === 'delete-user') {
      if (isSelfUser(req, username)) {
        auditAdminAction({
          req,
          actor: req.writerSession.username,
          action: 'delete-user',
          targetUsername: username,
          outcome: 'failed',
          detail: 'self-delete-blocked'
        });
        return redirectAdminPage(res, { err: 'You cannot delete your own admin account.' });
      }

      const user = userStore.deleteUser(username);
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'delete-user',
        targetUsername: user.username,
        outcome: 'success',
        detail: null
      });
      return redirectAdminPage(res, { msg: `Deleted user ${user.username}` });
    }

    return redirectAdminPage(res, { err: `Unknown action: ${action}` });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: action || 'unknown',
      targetUsername: username || null,
      outcome: 'failed',
      detail: err.message
    });
    return redirectAdminPage(res, { err: err.message });
  }
});

app.get([`${sitePrefix}/auth/users`, '/auth/users'], requireAdminSession, (req, res) => {
  const users = userStore.listUsers();
  auditAdminAction({
    req,
    actor: req.writerSession.username,
    action: 'list-users',
    targetUsername: null,
    outcome: 'success',
    detail: `count:${users.length}`
  });

  res.json({
    ok: true,
    wikiName,
    users,
    performedBy: req.writerSession.username
  });
});

app.post([`${sitePrefix}/auth/users`, '/auth/users'], requireAdminSession, (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const user = userStore.createUser({ username, password, role });
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'create-user',
      targetUsername: user.username,
      outcome: 'success',
      detail: `role:${user.role}`
    });

    return res.status(201).json({
      ok: true,
      user,
      performedBy: req.writerSession.username
    });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'create-user',
      targetUsername: req.body?.username,
      outcome: 'failed',
      detail: err.message
    });

    return res.status(400).json({
      error: 'user-create-failed',
      message: err.message
    });
  }
});

app.patch([`${sitePrefix}/auth/users/:username/role`, '/auth/users/:username/role'], requireAdminSession, (req, res) => {
  try {
    const requestedRole = String(req.body?.role || '').trim().toLowerCase();
    if (isSelfAction(req) && requestedRole && requestedRole !== 'admin') {
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'set-role',
        targetUsername: req.params.username,
        outcome: 'failed',
        detail: 'self-demotion-blocked'
      });

      return res.status(400).json({
        error: 'self-admin-change-blocked',
        message: 'You cannot demote your own admin role.'
      });
    }

    const user = userStore.setRole(req.params.username, req.body?.role);
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'set-role',
      targetUsername: user.username,
      outcome: 'success',
      detail: `role:${user.role}`
    });

    return res.json({
      ok: true,
      user,
      performedBy: req.writerSession.username
    });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'set-role',
      targetUsername: req.params.username,
      outcome: 'failed',
      detail: err.message
    });

    return res.status(400).json({
      error: 'user-role-update-failed',
      message: err.message
    });
  }
});

app.patch([`${sitePrefix}/auth/users/:username/active`, '/auth/users/:username/active'], requireAdminSession, (req, res) => {
  try {
    const rawIsActive = req.body?.isActive;
    const isActive = rawIsActive === true
      || rawIsActive === 'true'
      || rawIsActive === false
      || rawIsActive === 'false'
      ? rawIsActive === true || rawIsActive === 'true'
      : rawIsActive;

    if (isSelfAction(req) && isActive === false) {
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'set-active',
        targetUsername: req.params.username,
        outcome: 'failed',
        detail: 'self-disable-blocked'
      });

      return res.status(400).json({
        error: 'self-admin-change-blocked',
        message: 'You cannot disable your own admin account.'
      });
    }

    if (typeof isActive !== 'boolean') {
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'set-active',
        targetUsername: req.params.username,
        outcome: 'failed',
        detail: 'invalid-isActive'
      });

      return res.status(400).json({
        error: 'invalid-isActive',
        message: 'isActive must be true or false.'
      });
    }

    const user = userStore.setActive(req.params.username, isActive);
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'set-active',
      targetUsername: user.username,
      outcome: 'success',
      detail: `isActive:${user.isActive}`
    });

    return res.json({
      ok: true,
      user,
      performedBy: req.writerSession.username
    });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'set-active',
      targetUsername: req.params.username,
      outcome: 'failed',
      detail: err.message
    });

    return res.status(400).json({
      error: 'user-active-update-failed',
      message: err.message
    });
  }
});

app.patch([`${sitePrefix}/auth/users/:username/password`, '/auth/users/:username/password'], requireAdminSession, (req, res) => {
  try {
    const password = req.body?.password;
    const user = userStore.setPassword(req.params.username, password);
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'set-password',
      targetUsername: user.username,
      outcome: 'success',
      detail: 'password-updated'
    });

    return res.json({
      ok: true,
      user,
      performedBy: req.writerSession.username
    });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'set-password',
      targetUsername: req.params.username,
      outcome: 'failed',
      detail: err.message
    });

    return res.status(400).json({
      error: 'user-password-update-failed',
      message: err.message
    });
  }
});

app.delete([`${sitePrefix}/auth/users/:username`, '/auth/users/:username'], requireAdminSession, (req, res) => {
  try {
    if (isSelfAction(req)) {
      auditAdminAction({
        req,
        actor: req.writerSession.username,
        action: 'delete-user',
        targetUsername: req.params.username,
        outcome: 'failed',
        detail: 'self-delete-blocked'
      });

      return res.status(400).json({
        error: 'self-admin-change-blocked',
        message: 'You cannot delete your own admin account.'
      });
    }

    const user = userStore.deleteUser(req.params.username);
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'delete-user',
      targetUsername: user.username,
      outcome: 'success',
      detail: null
    });

    return res.json({
      ok: true,
      user,
      performedBy: req.writerSession.username
    });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'delete-user',
      targetUsername: req.params.username,
      outcome: 'failed',
      detail: err.message
    });

    return res.status(400).json({
      error: 'user-delete-failed',
      message: err.message
    });
  }
});

// ── Version API ───────────────────────────────────────────────────────────

app.post([`${sitePrefix}/api/save`, '/api/save'], requireAdminSession, async (req, res) => {
  try {
    const result = await gitSync.forceCommit();
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'force-save',
      targetUsername: null,
      outcome: 'success',
      detail: result.message
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'force-save',
      targetUsername: null,
      outcome: 'failed',
      detail: err.message
    });
    return res.status(500).json({ error: 'force-save-failed', message: err.message });
  }
});

app.get([`${sitePrefix}/api/version`, '/api/version'], (req, res) => {
  const session = getWriterSession(req);
  if (!session) {
    return res.status(401).json({ error: 'login-required', message: 'Login required.' });
  }

  gitSync.getCurrentVersion()
    .then((currentVersion) => gitSync.listVersionTags().then((tags) => ({ currentVersion, tags })))
    .then((data) => res.json({ ok: true, ...data }))
    .catch((err) => res.status(500).json({ error: 'version-query-failed', message: err.message }));
});

app.post([`${sitePrefix}/api/version`, '/api/version'], requireAdminSession, async (req, res) => {
  const bump = String(req.body?.bump || '').trim().toLowerCase();
  if (!['patch', 'minor', 'major'].includes(bump)) {
    return res.status(400).json({ error: 'invalid-bump', message: 'bump must be patch, minor, or major' });
  }

  try {
    const result = await gitSync.createVersionTag(bump, req.writerSession.username);
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'bump-version',
      targetUsername: null,
      outcome: 'success',
      detail: `${result.previousVersion} → ${result.newVersion} (${bump})`
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    auditAdminAction({
      req,
      actor: req.writerSession.username,
      action: 'bump-version',
      targetUsername: null,
      outcome: 'failed',
      detail: err.message
    });
    return res.status(500).json({ error: 'version-bump-failed', message: err.message });
  }
});

app.get(['/health', `${sitePrefix}/health`], (req, res) => {
  res.json({
    ok: true,
    service: 'tiddlyharbor-wiki',
    wikiName,
    twPort,
    gitAutosaveEnabled: process.env.GIT_AUTOSAVE_ENABLED !== 'false'
  });
});

app.use(requireBasicWriteAuth({
  authenticateCredentials: (username, password) => authenticateWriter(username, password)
}));

app.use((req, res, next) => {
  const isMutation = req.method === 'PUT' || req.method === 'DELETE';
  const effectivePath = getEffectivePath(req);
  const isRecipeWrite = effectivePath.startsWith('/recipes/');
  const shouldTrackInGit = !isBenignStateWritePath(effectivePath);

  if (isMutation && isRecipeWrite && shouldTrackInGit) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        gitSync.markDirty();
      }
    });
  }

  next();
});

app.use(
  '/',
  createProxyMiddleware({
    target: `http://127.0.0.1:${twPort}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    on: {
      // Express body parsers (json, urlencoded) consume the request stream
      // before the proxy sees it.  fixRequestBody re-serialises req.body so
      // PUT/DELETE requests reach TiddlyWiki intact.
      proxyReq: fixRequestBody
    }
  })
);

const server = app.listen(publicPort, () => {
  console.log(`TiddlyHarbor wiki listening on ${publicPort}, proxying to TW on ${twPort}`);
});

function shutdown() {
  server.close(() => {
    gitSync.shutdown().catch((err) => {
      console.error('GitSync shutdown flush failed:', err.message);
    }).finally(() => {
      if (!twProcess.killed) {
        twProcess.kill('SIGTERM');
      }
      process.exit(0);
    });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
