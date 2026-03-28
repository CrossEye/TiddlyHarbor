const basicAuth = require('basic-auth');

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Basic realm="TiddlyHarbor"');
  return res.status(401).send('Authentication required for write operations.');
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

    const creds = basicAuth(req);
    if (!creds) {
      return unauthorized(res);
    }

    if (creds.name !== expectedUser || creds.pass !== expectedPass) {
      return unauthorized(res);
    }

    return next();
  };
}

module.exports = {
  requireBasicWriteAuth
};
