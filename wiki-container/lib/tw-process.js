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

function ensureReadOnlyNoticeTiddler(wikiPath, wikiName) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const noticePath = path.join(tiddlersPath, '$__tiddlyharbor_ui_readonly-notice.tid');
  const loginPath = `/${wikiName}/login`;
  const content = [
    'title: $:/tiddlyharbor/ui/readonly-notice',
    'tags: $:/tags/TopBody',
    'type: text/vnd.tiddlywiki',
    '',
    '<$reveal state="$:/status/IsReadOnly" type="match" text="yes" default="no">',
    '<div style="background:#fff8dc;border:1px solid #e6d8a8;border-radius:4px;padding:.5em .75em;margin:.5em 0;">',
    '<strong>Read-only view.</strong> You are browsing as a public reader.',
    `<a href="${loginPath}" style="margin-left:.5em;">Writer login</a>`,
    '</div>',
    '</$reveal>',
    ''
  ].join('\n');

  fs.mkdirSync(tiddlersPath, { recursive: true });
  fs.writeFileSync(noticePath, content, 'utf8');
}

function startTiddlyWiki(wikiPath, port, wikiName) {
  ensureWikiInitialized(wikiPath);
  ensurePathPrefixConfig(wikiPath, wikiName);
  ensureReadOnlyNoticeTiddler(wikiPath, wikiName);

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
