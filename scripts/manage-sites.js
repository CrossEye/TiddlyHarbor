const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const sitesFile = path.join(root, 'config', 'sites.yml');

function loadConfig() {
  const raw = fs.readFileSync(sitesFile, 'utf8');
  const parsed = yaml.load(raw) || {};
  return {
    defaults: parsed.defaults || {},
    sites: parsed.sites || {}
  };
}

function saveConfig(config) {
  const content = yaml.dump(config, { noRefs: true, lineWidth: 120, sortKeys: false });
  fs.writeFileSync(sitesFile, content, 'utf8');
}

function regenerate() {
  console.log('\nRegenerating docker-compose.yml and Caddyfile...');
  execSync('node scripts/generate-config.js', { cwd: root, stdio: 'inherit' });
  console.log('\nRun `docker compose up -d --build` to apply changes.');
}

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (const arg of args) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (match) {
      flags[match[1]] = match[2];
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

const VALID_NAME = /^[a-z][a-z0-9-]*$/;

function cmdList() {
  const config = loadConfig();
  const names = Object.keys(config.sites);
  if (names.length === 0) {
    console.log('No sites configured.');
    return;
  }

  console.log(`\n  ${'Name'.padEnd(16)} ${'Path'.padEnd(16)} ${'Domain'.padEnd(30)} Repo`);
  console.log(`  ${'─'.repeat(16)} ${'─'.repeat(16)} ${'─'.repeat(30)} ${'─'.repeat(20)}`);
  for (const name of names) {
    const site = config.sites[name] || {};
    const sitePath = site.path || `/${name}`;
    const domain = Array.isArray(site.domain) ? site.domain.join(', ') : (site.domain || '—');
    const repo = site.repo || '—';
    console.log(`  ${name.padEnd(16)} ${sitePath.padEnd(16)} ${domain.padEnd(30)} ${repo}`);
  }
  console.log();
}

function cmdAdd(args) {
  const { flags, positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error('Usage: manage-sites add <name> [--domain=x] [--path=/x] [--repo=url]');
    process.exit(1);
  }

  if (!VALID_NAME.test(name)) {
    console.error(`Invalid site name "${name}". Use lowercase letters, digits, and hyphens (must start with a letter).`);
    process.exit(1);
  }

  const config = loadConfig();
  if (config.sites[name]) {
    console.error(`Site "${name}" already exists.`);
    process.exit(1);
  }

  const site = {};
  if (flags.path) {
    // Normalize: strip any Windows/MSYS path prefix, keep only the last segment
    let p = flags.path.replace(/^[A-Za-z]:.*\//, '/');
    if (!p.startsWith('/')) p = `/${p}`;
    site.path = p;
  } else {
    site.path = `/${name}`;
  }
  if (flags.domain) site.domain = flags.domain;
  if (flags.repo) site.repo = flags.repo;

  config.sites[name] = Object.keys(site).length > 0 ? site : { path: `/${name}` };
  saveConfig(config);
  console.log(`Added site "${name}" with path ${site.path || `/${name}`}`);
  regenerate();
}

function cmdRemove(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: manage-sites remove <name>');
    process.exit(1);
  }

  const config = loadConfig();
  if (!config.sites[name]) {
    console.error(`Site "${name}" not found.`);
    process.exit(1);
  }

  const remaining = Object.keys(config.sites).length - 1;
  if (remaining < 1) {
    console.error('Cannot remove the last site.');
    process.exit(1);
  }

  delete config.sites[name];
  saveConfig(config);
  console.log(`Removed site "${name}" (${remaining} site${remaining === 1 ? '' : 's'} remaining)`);
  regenerate();
}

const command = process.argv[2];
const rest = process.argv.slice(3);

switch (command) {
  case 'list':
    cmdList();
    break;
  case 'add':
    cmdAdd(rest);
    break;
  case 'remove':
    cmdRemove(rest);
    break;
  default:
    console.log('Usage: manage-sites <list|add|remove> [args]');
    console.log('  list                           Show all configured sites');
    console.log('  add <name> [--domain=x] [--path=/x] [--repo=url]  Add a site');
    console.log('  remove <name>                  Remove a site');
    process.exit(command ? 1 : 0);
}
