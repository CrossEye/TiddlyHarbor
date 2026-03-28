const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { startTiddlyWiki } = require('./lib/tw-process');
const { requireBasicWriteAuth } = require('./lib/write-guard');
const { GitSync } = require('./lib/git-sync');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();

const publicPort = Number(process.env.PORT || 8080);
const twPort = Number(process.env.TW_INTERNAL_PORT || 8081);
const wikiPath = process.env.WIKI_PATH || path.join(__dirname, 'wiki');
const wikiName = process.env.WIKI_NAME || 'main';
const sitePrefix = `/${wikiName}`;

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

function getEffectivePath(req) {
  if (req.path === sitePrefix) {
    return '/';
  }

  if (req.path.startsWith(sitePrefix + '/')) {
    return req.path.slice(sitePrefix.length);
  }

  return req.path;
}

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
  const isRecipeWrite = getEffectivePath(req).startsWith('/recipes/');

  if (isMutation && isRecipeWrite) {
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
