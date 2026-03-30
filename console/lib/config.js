'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

const VALID_NAME = /^[a-z][a-z0-9-]*$/;

function loadConfig(sitesPath) {
  const raw = fs.readFileSync(sitesPath, 'utf8');
  const parsed = yaml.load(raw) || {};
  return {
    defaults: parsed.defaults || {},
    sites: parsed.sites || {}
  };
}

function saveConfig(sitesPath, config) {
  const content = yaml.dump(config, { noRefs: true, lineWidth: 120, sortKeys: false });
  fs.writeFileSync(sitesPath, content, 'utf8');
}

function normalizePath(p) {
  if (!p) return null;
  let cleaned = String(p).replace(/^[A-Za-z]:.*\//, '/');
  if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`;
  return cleaned;
}

function parseFormToSiteConfig(body) {
  const site = {};

  if (body.path && body.path.trim()) {
    site.path = normalizePath(body.path.trim());
  }

  if (body.domain && body.domain.trim()) {
    const domains = body.domain.split(',').map((d) => d.trim()).filter(Boolean);
    site.domain = domains.length === 1 ? domains[0] : domains;
  }

  // Combine repo URL + token into a single authenticated URL for git
  const repoUrl = (body.git_repo_url || '').trim();
  const repoToken = (body.git_token || '').trim();
  if (repoUrl) {
    if (repoToken) {
      // Insert token: https://github.com/... → https://TOKEN@github.com/...
      site.repo = repoUrl.replace(/^(https?:\/\/)/, `$1${repoToken}@`);
    } else {
      site.repo = repoUrl;
    }
  }

  if (body.git_branch && body.git_branch.trim()) {
    site.git_branch = body.git_branch.trim();
  }

  if (body.basic_auth_user && body.basic_auth_user.trim()) {
    site.basic_auth_user = body.basic_auth_user.trim();
  }
  if (body.basic_auth_pass && body.basic_auth_pass.trim()) {
    site.basic_auth_pass = body.basic_auth_pass.trim();
  }

  // Boolean overrides (checkboxes: present = true, absent = use default)
  if (body.public_read !== undefined) {
    site.public_read = body.public_read === 'on' || body.public_read === 'true';
  }
  if (body.git_autosave_enabled !== undefined) {
    site.git_autosave_enabled = body.git_autosave_enabled === 'on' || body.git_autosave_enabled === 'true';
  }
  if (body.git_autopush !== undefined) {
    site.git_autopush = body.git_autopush === 'on' || body.git_autopush === 'true';
  }

  // Numeric overrides
  if (body.quiescence_minutes && body.quiescence_minutes.trim()) {
    const n = Number(body.quiescence_minutes);
    if (!Number.isNaN(n) && n > 0) site.quiescence_minutes = n;
  }
  if (body.max_commit_interval_minutes && body.max_commit_interval_minutes.trim()) {
    const n = Number(body.max_commit_interval_minutes);
    if (!Number.isNaN(n) && n > 0) site.max_commit_interval_minutes = n;
  }

  // OAuth providers: "default" = omit (inherit), "none" = disable, otherwise comma-split
  if (body.oauth_providers && body.oauth_providers.trim()) {
    const val = body.oauth_providers.trim().toLowerCase();
    if (val === 'default' || val === '') {
      // omit — inherits from defaults
    } else if (val === 'none') {
      site.oauth_providers = 'none';
    } else {
      site.oauth_providers = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  return site;
}

function addSite(sitesPath, name, siteConfig) {
  if (!name || !VALID_NAME.test(name)) {
    return { ok: false, error: `Invalid site name "${name}". Use lowercase letters, digits, and hyphens (must start with a letter).` };
  }

  const config = loadConfig(sitesPath);
  if (config.sites[name]) {
    return { ok: false, error: `Site "${name}" already exists.` };
  }

  if (!siteConfig.path) {
    siteConfig.path = `/${name}`;
  }

  config.sites[name] = siteConfig;
  saveConfig(sitesPath, config);
  return { ok: true };
}

function updateSite(sitesPath, name, siteConfig) {
  const config = loadConfig(sitesPath);
  if (!config.sites[name]) {
    return { ok: false, error: `Site "${name}" not found.` };
  }

  // Merge: new values overwrite, but keep existing fields not in the update
  config.sites[name] = { ...config.sites[name], ...siteConfig };

  // Remove fields explicitly set to empty/null so defaults apply
  for (const [key, val] of Object.entries(config.sites[name])) {
    if (val === '' || val === null) {
      delete config.sites[name][key];
    }
  }

  saveConfig(sitesPath, config);
  return { ok: true };
}

function removeSite(sitesPath, name) {
  const config = loadConfig(sitesPath);
  if (!config.sites[name]) {
    return { ok: false, error: `Site "${name}" not found.` };
  }

  const remaining = Object.keys(config.sites).length - 1;
  if (remaining < 1) {
    return { ok: false, error: 'Cannot remove the last site.' };
  }

  delete config.sites[name];
  saveConfig(sitesPath, config);
  return { ok: true };
}

module.exports = {
  VALID_NAME,
  loadConfig,
  saveConfig,
  addSite,
  updateSite,
  removeSite,
  parseFormToSiteConfig
};
