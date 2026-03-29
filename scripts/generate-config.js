const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const sitesFile = path.join(root, 'config', 'sites.yml');
const composeFile = path.join(root, 'docker-compose.yml');
const caddyFile = path.join(root, 'Caddyfile');

function loadSites() {
  const raw = fs.readFileSync(sitesFile, 'utf8');
  const parsed = yaml.load(raw) || {};

  if (!parsed.sites || typeof parsed.sites !== 'object') {
    throw new Error('config/sites.yml must contain a sites map');
  }

  return {
    defaults: parsed.defaults || {},
    sites: parsed.sites
  };
}

function toEnvValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function buildCompose(config) {
  const services = {};
  const volumes = {};

  const siteNames = Object.keys(config.sites);
  if (siteNames.length === 0) {
    throw new Error('config/sites.yml has no sites configured');
  }

  for (const siteName of siteNames) {
    const site = config.sites[siteName] || {};
    const serviceName = `wiki-${siteName}`;
    const volumeName = `wiki_${siteName}_data`;

    volumes[volumeName] = null;

    services[serviceName] = {
      build: {
        context: './wiki-container'
      },
      environment: [
        'PORT=8080',
        'TW_INTERNAL_PORT=8081',
        'WIKI_PATH=/app/wiki',
        `WIKI_NAME=${siteName}`,
        'WRITER_SESSION_SECRET=${WRITER_SESSION_SECRET:-change-me-session-secret}',
        `BASIC_AUTH_USER=\${${siteName.toUpperCase()}_BASIC_AUTH_USER:-admin}`,
        `BASIC_AUTH_PASS=\${${siteName.toUpperCase()}_BASIC_AUTH_PASS:-change-me-${siteName}}`,
        `GIT_AUTOSAVE_ENABLED=${toEnvValue(site.git_autosave_enabled ?? config.defaults.git_autosave_enabled ?? true)}`,
        `GIT_AUTOPUSH=${toEnvValue(site.git_autopush ?? config.defaults.git_autopush ?? false)}`,
        `QUIESCENCE_MINUTES=${toEnvValue(site.quiescence_minutes ?? config.defaults.quiescence_minutes ?? 5)}`,
        `MAX_COMMIT_INTERVAL_MINUTES=${toEnvValue(site.max_commit_interval_minutes ?? config.defaults.max_commit_interval_minutes ?? 60)}`,
        `GIT_REMOTE_URL=${site.repo || ''}`,
        `PUBLIC_READ=${toEnvValue(site.public_read ?? config.defaults.public_read ?? true)}`,
        'OAUTH_EXTERNAL_BASE_URL=${OAUTH_EXTERNAL_BASE_URL:-}',
        'OAUTH_GITHUB_CLIENT_ID=${OAUTH_GITHUB_CLIENT_ID:-}',
        'OAUTH_GITHUB_CLIENT_SECRET=${OAUTH_GITHUB_CLIENT_SECRET:-}',
        'OAUTH_GOOGLE_CLIENT_ID=${OAUTH_GOOGLE_CLIENT_ID:-}',
        'OAUTH_GOOGLE_CLIENT_SECRET=${OAUTH_GOOGLE_CLIENT_SECRET:-}',
        `OAUTH_PROVIDERS=${(site.oauth_providers ?? config.defaults.oauth_providers ?? []).join(',')}`,
        'SMTP_HOST=${SMTP_HOST:-}',
        'SMTP_PORT=${SMTP_PORT:-587}',
        'SMTP_USER=${SMTP_USER:-}',
        'SMTP_PASS=${SMTP_PASS:-}',
        'SMTP_FROM=${SMTP_FROM:-}'
      ],
      volumes: [`${volumeName}:/app/wiki`],
      restart: 'unless-stopped'
    };
  }

  services.caddy = {
    image: 'caddy:2-alpine',
    ports: ['80:80', '443:443'],
    volumes: [
      './Caddyfile:/etc/caddy/Caddyfile:ro',
      'caddy_data:/data',
      'caddy_config:/config'
    ],
    depends_on: Object.keys(services).filter((name) => name.startsWith('wiki-')),
    restart: 'unless-stopped'
  };

  volumes.caddy_data = null;
  volumes.caddy_config = null;

  return {
    services,
    volumes
  };
}

function normalizedDomains(site) {
  if (!site.domain) {
    return [];
  }
  if (Array.isArray(site.domain)) {
    return site.domain;
  }
  return [site.domain];
}

function normalizedPath(siteName, site) {
  if (!site.path) {
    return `/${siteName}`;
  }
  return site.path.startsWith('/') ? site.path : `/${site.path}`;
}

function buildCaddy(config) {
  const siteNames = Object.keys(config.sites);

  const domainBlocks = [];
  const pathHandles = [];
  const pathRedirects = [];

  for (const siteName of siteNames) {
    const site = config.sites[siteName] || {};
    const serviceName = `wiki-${siteName}:8080`;

    for (const domain of normalizedDomains(site)) {
      domainBlocks.push(`${domain} {\n  reverse_proxy ${serviceName}\n}`);
    }

    const sitePath = normalizedPath(siteName, site);
    pathRedirects.push(`  redir ${sitePath} ${sitePath}/`);
    pathHandles.push(`  handle ${sitePath}/* {\n    reverse_proxy ${serviceName}\n  }`);
  }

  const defaultSitePath = normalizedPath(siteNames[0], config.sites[siteNames[0]] || {});

  const localBlock = [
    ':80 {',
    `  redir / ${defaultSitePath}/`,
    ...pathRedirects,
    ...pathHandles,
    '  respond "Unknown site path" 404',
    '}'
  ].join('\n');

  return [...domainBlocks, localBlock, ''].join('\n\n');
}

function writeOutputs(compose, caddy) {
  const composeText = yaml.dump(compose, {
    noRefs: true,
    lineWidth: 120,
    sortKeys: false
  });

  fs.writeFileSync(composeFile, composeText, 'utf8');
  fs.writeFileSync(caddyFile, caddy, 'utf8');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const config = loadSites();
  const compose = buildCompose(config);
  const caddy = buildCaddy(config);

  if (!checkOnly) {
    writeOutputs(compose, caddy);
  }

  console.log(`Sites loaded: ${Object.keys(config.sites).join(', ')}`);
  console.log(checkOnly ? 'Validation succeeded.' : 'Generated docker-compose.yml and Caddyfile from config/sites.yml');
}

main();
