const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { renderWriterLoginPage } = require('./lib/auth-pages');
const { startTiddlyWiki } = require('./lib/tw-process');
const { requireBasicWriteAuth } = require('./lib/write-guard');
const { buildExpiredSessionCookieHeader, buildSessionCookieHeader, hasValidWriterSession } = require('./lib/writer-session');
const { GitSync } = require('./lib/git-sync');
const tiddlyWikiVersion = require('tiddlywiki/package.json').version;

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();

const publicPort = Number(process.env.PORT || 8080);
const twPort = Number(process.env.TW_INTERNAL_PORT || 8081);
const wikiPath = process.env.WIKI_PATH || path.join(__dirname, 'wiki');
const wikiName = process.env.WIKI_NAME || 'main';
const sitePrefix = `/${wikiName}`;
const writerUsername = process.env.BASIC_AUTH_USER || 'admin';

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

function isValidWriterCredentials(username, password) {
  return username === writerUsername
    && password === (process.env.BASIC_AUTH_PASS || 'change-me');
}

function isTiddlyWikiSyncRequest(req) {
  const requestedWith = req.get('X-Requested-With') || '';
  const accept = req.get('Accept') || '';
  return requestedWith === 'TiddlyWiki' || accept.includes('application/json');
}

function getStatusPayload(req) {
  const authenticated = hasValidWriterSession(req);

  return {
    username: authenticated ? writerUsername : 'GUEST',
    anonymous: !authenticated,
    read_only: !authenticated,
    logout_is_available: true,
    space: {
      recipe: 'default'
    },
    tiddlywiki_version: tiddlyWikiVersion
  };
}

function completeWriterLogin(req, res) {
  res.setHeader('Set-Cookie', buildSessionCookieHeader(sitePrefix));

  if (isTiddlyWikiSyncRequest(req)) {
    return res.status(204).end();
  }

  return res.redirect(`${sitePrefix}/`);
}

function completeWriterLogout(req, res) {
  res.setHeader('Set-Cookie', buildExpiredSessionCookieHeader(sitePrefix));

  if (isTiddlyWikiSyncRequest(req)) {
    return res.status(204).end();
  }

  return res.redirect(`${sitePrefix}/`);
}

app.get([`${sitePrefix}/login`, '/login'], (req, res) => {
  if (hasValidWriterSession(req)) {
    return res.redirect(`${sitePrefix}/`);
  }

  return res.status(200).send(renderWriterLoginPage({
    wikiName,
    sitePrefix,
    errorMessage: req.query.error === 'invalid' ? 'Incorrect username or password.' : ''
  }));
});

app.post([`${sitePrefix}/login`, '/login'], (req, res) => {
  const username = req.body?.username || '';
  const password = req.body?.password || '';

  if (!isValidWriterCredentials(username, password)) {
    return res.status(401).send(renderWriterLoginPage({
      wikiName,
      sitePrefix,
      errorMessage: 'Incorrect username or password.'
    }));
  }

  return completeWriterLogin(req, res);
});

app.post([`${sitePrefix}/challenge/tiddlywebplugins.tiddlyspace.cookie_form`, '/challenge/tiddlywebplugins.tiddlyspace.cookie_form'], (req, res) => {
  const username = req.body?.user || req.body?.username || '';
  const password = req.body?.password || '';

  if (!isValidWriterCredentials(username, password)) {
    return res.status(401).json({
      error: 'invalid-credentials',
      message: 'Incorrect username or password.'
    });
  }

  return completeWriterLogin(req, res);
});

app.post([`${sitePrefix}/logout`, '/logout'], (req, res) => {
  return completeWriterLogout(req, res);
});

app.get([`${sitePrefix}/status`, '/status'], (req, res) => {
  res.json(getStatusPayload(req));
});

app.get([`${sitePrefix}/auth/status`, '/auth/status'], (req, res) => {
  res.json({
    ok: true,
    wikiName,
    authenticated: hasValidWriterSession(req),
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

app.use(requireBasicWriteAuth());

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
