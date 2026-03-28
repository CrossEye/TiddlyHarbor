const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { renderWriterLoginPage } = require('./lib/auth-pages');
const { startTiddlyWiki } = require('./lib/tw-process');
const { requireBasicWriteAuth } = require('./lib/write-guard');
const { buildExpiredSessionCookieHeader, buildSessionCookieHeader, getWriterSession, hasValidWriterSession } = require('./lib/writer-session');
const { GitSync } = require('./lib/git-sync');
const { hasWriteAccess, UserStore } = require('./lib/user-store');
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

  return res.status(200).send(renderWriterLoginPage({
    wikiName,
    sitePrefix,
    nextPath,
    errorMessage: req.query.error === 'invalid' ? 'Incorrect username or password.' : ''
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
    logLevel: 'warn'
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
