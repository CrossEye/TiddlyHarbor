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
        `BASIC_AUTH_USER=${site.basic_auth_user || `\${${siteName.toUpperCase()}_BASIC_AUTH_USER:-admin}`}`,
        `BASIC_AUTH_PASS=${site.basic_auth_pass || `\${${siteName.toUpperCase()}_BASIC_AUTH_PASS:-change-me-${siteName}}`}`,
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
        `OAUTH_PROVIDERS=${(() => { const p = site.oauth_providers ?? config.defaults.oauth_providers; if (p === undefined) return ''; if (p === 'none' || (Array.isArray(p) && p.length === 0)) return 'none'; return Array.isArray(p) ? p.join(',') : String(p); })()}`,
        'ADMIN_EMAIL=${ADMIN_EMAIL:-}',
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

  // Console service (if console/Dockerfile exists on disk or CONSOLE_PASS is configured)
  const consoleDockerfile = path.join(root, 'console', 'Dockerfile');
  if (fs.existsSync(consoleDockerfile) || process.env.CONSOLE_PASS) {
    services.console = {
      build: { context: './console' },
      environment: [
        'CONSOLE_USER=${CONSOLE_USER:-admin}',
        'CONSOLE_PASS=${CONSOLE_PASS:-change-me-console}',
        'HOST_PROJECT_DIR=${HOST_PROJECT_DIR}',
        'SITES_PATH=/app/config/sites.yml',
        'BASE_PATH=/_console'
      ],
      volumes: [
        './config:/app/config',
        './scripts:/app/scripts',
        './docker-compose.yml:/app/docker-compose.yml',
        './Caddyfile:/app/Caddyfile',
        '/var/run/docker.sock:/var/run/docker.sock'
      ],
      restart: 'unless-stopped'
    };
  }

  const dependsOn = Object.keys(services).filter((name) => name.startsWith('wiki-'));
  if (services.console) dependsOn.push('console');

  services.caddy = {
    image: 'caddy:2-alpine',
    ports: ['80:80', '443:443'],
    volumes: [
      './Caddyfile:/etc/caddy/Caddyfile:ro',
      'caddy_data:/data',
      'caddy_config:/config'
    ],
    depends_on: dependsOn,
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
      domainBlocks.push(`${domain} {\n\treverse_proxy ${serviceName}\n}`);
    }

    const sitePath = normalizedPath(siteName, site);
    pathRedirects.push(`\tredir ${sitePath} ${sitePath}/`);
    pathHandles.push(`\thandle ${sitePath}/* {\n\t\treverse_proxy ${serviceName}\n\t}`);
  }

  // Console routing (if console service exists)
  const hasConsole = fs.existsSync(path.join(root, 'console', 'Dockerfile')) || !!process.env.CONSOLE_PASS;

  if (hasConsole) {
    // Dedicated domain for console (if CONSOLE_DOMAIN is set in sites.yml defaults)
    const consoleDomain = config.defaults.console_domain;
    if (consoleDomain) {
      domainBlocks.push(`${consoleDomain} {\n  reverse_proxy console:3000\n}`);
    }

    // Path-based fallback: /_console proxies to console
    pathRedirects.push('\tredir /_console /_console/');
    pathHandles.push('\thandle /_console/* {\n\t\turi strip_prefix /_console\n\t\treverse_proxy console:3000\n\t}');
  }

  const defaultSitePath = normalizedPath(siteNames[0], config.sites[siteNames[0]] || {});

  const localBlock = [
    ':80 {',
    `\tredir / ${defaultSitePath}/`,
    ...pathRedirects,
    ...pathHandles,
    '\trespond "Unknown site path" 404',
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
