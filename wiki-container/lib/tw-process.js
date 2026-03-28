const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function tiddlywikiBin() {
  return process.platform === 'win32'
    ? path.join(__dirname, '..', 'node_modules', '.bin', 'tiddlywiki.cmd')
    : path.join(__dirname, '..', 'node_modules', '.bin', 'tiddlywiki');
}

function ensureWikiInitialized(wikiPath) {
  const infoPath = path.join(wikiPath, 'tiddlywiki.info');
  if (fs.existsSync(infoPath)) {
    return;
  }

  fs.mkdirSync(wikiPath, { recursive: true });

  const bin = tiddlywikiBin();
  const init = spawnSync(bin, [wikiPath, '--init', 'server'], {
    stdio: 'inherit'
  });

  if (init.status !== 0) {
    throw new Error('Failed to initialize TiddlyWiki server edition');
  }
}

function ensurePathPrefixConfig(wikiPath, wikiName) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const configPath = path.join(tiddlersPath, '$__config_tiddlyweb_host.tid');
  const sitePrefix = `/${wikiName}`;
  const content = [
    'title: $:/config/tiddlyweb/host',
    '',
    `$protocol$//$host$${sitePrefix}/`,
    ''
  ].join('\n');

  fs.mkdirSync(tiddlersPath, { recursive: true });
  fs.writeFileSync(configPath, content, 'utf8');
}

function startTiddlyWiki(wikiPath, port, wikiName) {
  ensureWikiInitialized(wikiPath);
  ensurePathPrefixConfig(wikiPath, wikiName);

  const bin = tiddlywikiBin();
  const args = [
    wikiPath,
    '--listen',
    `host=0.0.0.0`,
    `port=${port}`,
    `path-prefix=/${wikiName}`,
    'readers=(anon)',
    'writers=(anon)',
    'username=',
    'password='
  ];

  const child = spawn(bin, args, {
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`TiddlyWiki process exited with code ${code} signal ${signal || ''}`);
    }
  });

  return child;
}

module.exports = {
  startTiddlyWiki
};
