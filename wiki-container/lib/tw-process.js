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

function removeLegacyReadOnlyNoticeTiddler(wikiPath) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const noticePath = path.join(tiddlersPath, '$__tiddlyharbor_ui_readonly-notice.tid');

  if (fs.existsSync(noticePath)) {
    fs.unlinkSync(noticePath);
  }
}

// Override the default SyncFilter to also exclude $:/StoryList.  The default
// filter already drops $:/HistoryList (prefix), $:/state/*, $:/temp/*,
// $:/status/* etc., but $:/StoryList slips through.  Every time a reader
// opens a tiddler the StoryList changes, the syncer queues a save, the
// server rejects it (no auth), and the sync indicator turns red.
function ensureSyncFilterConfig(wikiPath) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const configPath = path.join(tiddlersPath, '$__config_SyncFilter.tid');
  const content = [
    'title: $:/config/SyncFilter',
    '',
    '[is[tiddler]] -[[$:/core]] -[[$:/library/sjcl.js]] -[prefix[$:/boot/]] -[[$:/StoryList]] -[prefix[$:/HistoryList]] -[status[pending]plugin-type[import]] -[[$:/isEncrypted]] -[prefix[$:/status/]] -[prefix[$:/state/]] -[prefix[$:/temp/]]',
    ''
  ].join('\n');

  fs.mkdirSync(tiddlersPath, { recursive: true });
  fs.writeFileSync(configPath, content, 'utf8');
}

// Conditional stylesheet that hides editing UI when TiddlyWiki is in
// read-only mode (i.e. the user is not authenticated as a writer/admin).
// The /status endpoint already returns read_only:true for anonymous users,
// which TW maps to $:/status/IsReadOnly = "yes".
function ensureReadOnlyStylesheet(wikiPath) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const configPath = path.join(tiddlersPath, '$__tiddlyharbor_ui_readonly-styles.tid');
  const content = [
    'title: $:/tiddlyharbor/ui/readonly-styles',
    'tags: $:/tags/Stylesheet',
    'type: text/vnd.tiddlywiki',
    '',
    '\\rules only filteredtranscludeinline macrodef macrocallinline html',
    '',
    '<$list filter="[{$:/status/IsReadOnly}match[yes]]">',
    '',
    '/* ── Page controls: hide content-creation buttons ── */',
    'button[aria-label="new tiddler"],',
    'button[aria-label="Create a new tiddler"],',
    'button[aria-label="new journal"],',
    'button[aria-label="Create a new journal tiddler"],',
    'button[aria-label="import"],',
    'button[aria-label="Import many types of file including text, image, TiddlyWiki or JSON"] {',
    '  display: none !important;',
    '}',
    '',
    '/* ── Tiddler toolbar: hide edit and clone ── */',
    'button[aria-label="Edit this tiddler"],',
    'button[aria-label="Clone this tiddler"] {',
    '  display: none !important;',
    '}',
    '',
    '/* ── Hide draft tiddlers list ── */',
    '.tc-drafts-list { display: none !important; }',
    '',
    '</$list>',
    ''
  ].join('\n');

  fs.mkdirSync(tiddlersPath, { recursive: true });
  fs.writeFileSync(configPath, content, 'utf8');
}

// A page-control button that shows a "sign in" link for anonymous / readonly
// visitors.  Uses the locked-padlock icon and links to the login page via a
// simple relative URL (resolves against the wiki's path-prefix base).
function ensureSignInButton(wikiPath) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const configPath = path.join(tiddlersPath, '$__tiddlyharbor_ui_Buttons_sign-in.tid');
  const content = [
    'title: $:/tiddlyharbor/ui/Buttons/sign-in',
    'tags: $:/tags/PageControls',
    'caption: {{$:/core/images/locked-padlock}} sign in',
    'description: Sign in for write access',
    '',
    '\\whitespace trim',
    '<$list filter="[{$:/status/IsReadOnly}match[yes]]" variable="ignore">',
    '<a href="login" class="tc-btn-invisible" title="Sign in for write access" aria-label="sign in" style="text-decoration:none;">',
    '<%if [<tv-config-toolbar-icons>match[yes]] %>',
    '{{$:/core/images/locked-padlock}}',
    '<%endif%>',
    '<%if [<tv-config-toolbar-text>match[yes]] %>',
    '<span class="tc-btn-text">sign in</span>',
    '<%endif%>',
    '</a>',
    '</$list>',
    ''
  ].join('\n');

  fs.mkdirSync(tiddlersPath, { recursive: true });
  fs.writeFileSync(configPath, content, 'utf8');
}

function removeLegacyVersionTiddlers(wikiPath) {
  const tiddlersPath = path.join(wikiPath, 'tiddlers');
  const legacyFiles = [
    '$__tiddlyharbor_version_startup.js.tid',
    '$__tiddlyharbor_version_messages.js.tid',
    '$__tiddlyharbor_version_sidebar.tid',
    '$__tiddlyharbor_version_styles.tid'
  ];

  for (const file of legacyFiles) {
    const filePath = path.join(tiddlersPath, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function ensurePluginRegistered(wikiPath) {
  const infoPath = path.join(wikiPath, 'tiddlywiki.info');
  if (!fs.existsSync(infoPath)) {
    return;
  }

  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  const pluginName = 'tiddlyharbor/version';

  if (!info.plugins) {
    info.plugins = [];
  }

  if (!info.plugins.includes(pluginName)) {
    info.plugins.push(pluginName);
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 4) + '\n', 'utf8');
  }
}


function startTiddlyWiki(wikiPath, port, wikiName) {
  ensureWikiInitialized(wikiPath);
  ensurePathPrefixConfig(wikiPath, wikiName);
  ensureSyncFilterConfig(wikiPath);
  ensureReadOnlyStylesheet(wikiPath);
  ensureSignInButton(wikiPath);
  ensurePluginRegistered(wikiPath);
  removeLegacyVersionTiddlers(wikiPath);
  removeLegacyReadOnlyNoticeTiddler(wikiPath);

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

  const pluginPath = path.join(__dirname, '..', 'plugins');
  const child = spawn(bin, args, {
    stdio: 'inherit',
    env: { ...process.env, TIDDLYWIKI_PLUGIN_PATH: pluginPath }
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
