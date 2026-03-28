const basicAuth = require('basic-auth');
const { hasValidWriterSession } = require('./writer-session');

function unauthorized(res, sitePrefix) {
  return res.status(401).json({
    error: 'writer-login-required',
    message: 'Writer login required for write operations.',
    loginPath: `${sitePrefix}/login`
  });
}

function respondNoopWrite(res, title) {
  const safeTitle = title || 'untitled';
  res.set('Etag', `"default/${encodeURIComponent(safeTitle)}/0:"`);
  return res.status(204).end();
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

function isBenignAnonymousStateWrite(effectivePath) {
  const title = extractTiddlerTitle(effectivePath);
  if (!title) {
    return { benign: false, title: null };
  }

  if (title.includes('StoryList') || title.includes('HistoryList')) {
    return { benign: true, title };
  }

  if (title.startsWith('Draft of ') || title.startsWith('$:/Draft')) {
    return { benign: true, title };
  }

  const benign = title === '$:/StoryList'
    || title === '$:/HistoryList'
    || title.startsWith('$:/state/')
    || title.startsWith('$:/temp/');

  return { benign, title };
}

function requireBasicWriteAuth() {
  const expectedUser = process.env.BASIC_AUTH_USER || 'admin';
  const expectedPass = process.env.BASIC_AUTH_PASS || 'change-me';
  const wikiName = process.env.WIKI_NAME || 'main';
  const sitePrefix = `/${wikiName}`;

  return function writeGuard(req, res, next) {
    const isMutation = req.method === 'PUT' || req.method === 'DELETE';
    const effectivePath = req.path.startsWith(sitePrefix + '/')
      ? req.path.slice(sitePrefix.length)
      : req.path === sitePrefix
        ? '/'
        : req.path;
    const isRecipeWrite = effectivePath.startsWith('/recipes/');

    if (!isMutation || !isRecipeWrite) {
      return next();
    }

    if (hasValidWriterSession(req)) {
      return next();
    }

    const { benign, title } = isBenignAnonymousStateWrite(effectivePath);
    const creds = basicAuth(req);
    if (!creds) {
      if (benign) {
        return respondNoopWrite(res, title);
      }
      return unauthorized(res, sitePrefix);
    }

    if (creds.name !== expectedUser || creds.pass !== expectedPass) {
      if (benign) {
        return respondNoopWrite(res, title);
      }
      return unauthorized(res, sitePrefix);
    }

    return next();
  };
}

module.exports = {
  requireBasicWriteAuth
};
