'use strict';

const path = require('path');
const fs = require('fs');

// Base path prefix for all internal URLs (e.g. "/_console" when behind a reverse proxy)
let BASE = '';
function setBasePath(p) { BASE = (p || '').replace(/\/+$/, ''); }

const LOGOS_DIR = path.join(__dirname, '../logos');
const WORDMARK_SVG = fs.readFileSync(path.join(LOGOS_DIR, 'wordmark-compact.svg'), 'utf8');
const FAVICON_DATA_URI = `data:image/svg+xml;base64,${
  Buffer.from(fs.readFileSync(path.join(LOGOS_DIR, 'favicon.svg'), 'utf8')).toString('base64')
}`;

const PAGE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin:0; font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
         background:#dce6f0; color:#0f2b44; }

  .th-header { background:#0f2b44; padding:0.6rem 1.5rem;
               display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .th-header-meta { color:#e8e8e8; font-size:0.85rem; text-align:right; line-height:1.5; }
  .th-header-meta .accent { color:#5dade2; }
  .th-wordmark svg { display:block; height:44px; width:auto; }

  .th-main { max-width:72rem; margin:2rem auto; padding:0 1rem 3rem; }

  .th-card { background:#fff; border:1px solid #b8cfe0; border-radius:0.75rem;
             box-shadow:0 4px 20px rgba(15,43,68,0.10); padding:2rem; margin-bottom:1.5rem; }

  .alert { padding:0.65rem 0.9rem; border-radius:0.4rem; margin-bottom:1rem; font-size:0.9rem; }
  .alert-success { color:#0a3d24; background:#d0f0e0; border-left:4px solid #27ae60; }
  .alert-error   { color:#5c0a12; background:#fde0e3; border-left:4px solid #e74c3c; }
  .alert-warning { color:#856404; background:#fef3cd; border-left:4px solid #f0d86e; }

  label { display:block; margin-bottom:0.25rem; font-size:0.8rem;
          font-weight:700; color:#1a3a5c; text-transform:uppercase; letter-spacing:0.04em; }
  .hint { font-size:0.75rem; color:#5d6d7e; font-weight:400; text-transform:none; letter-spacing:0; margin-left:0.3rem; }
  input[type=text], input[type=number] {
    width:100%; padding:0.6rem 0.75rem; border:1px solid #94a3b8;
    border-radius:0.4rem; font-size:1rem; margin-bottom:1rem;
    transition:border-color 0.15s, box-shadow 0.15s; }
  input[type=text]:focus, input[type=number]:focus {
    outline:none; border-color:#2e86ab; box-shadow:0 0 0 3px rgba(46,134,171,0.18); }
  select {
    width:100%; padding:0.6rem 0.75rem; border:1px solid #94a3b8;
    border-radius:0.4rem; font-size:1rem; margin-bottom:1rem; background:#fff; color:#0f2b44; }

  .btn { display:inline-block; padding:0.55rem 1.1rem; border:0; border-radius:0.4rem;
         font-size:0.875rem; font-weight:700; cursor:pointer; transition:background 0.15s;
         text-decoration:none; text-align:center; }
  .btn-primary  { background:#2e86ab; color:#fff; }
  .btn-primary:hover  { background:#1a5276; }
  .btn-action   { background:#1a3a5c; color:#e8e8e8; }
  .btn-action:hover   { background:#0f2b44; }
  .btn-danger   { background:#c0392b; color:#fff; }
  .btn-danger:hover   { background:#922b21; }
  .btn-sm { padding:0.3rem 0.65rem; font-size:0.78rem; }
  .btn-link { background:none; color:#2e86ab; padding:0; font-weight:600; }
  .btn-link:hover { color:#1a5276; text-decoration:underline; }

  .th-table { width:100%; border-collapse:collapse; }
  .th-table thead tr { background:#0f2b44; }
  .th-table thead th { padding:0.6rem 0.75rem; font-size:0.78rem; font-weight:700;
                       letter-spacing:0.06em; text-align:left; color:#e8e8e8; }
  .th-table tbody tr:nth-child(even) { background:#f0f5fa; }
  .th-table tbody tr:hover { background:#e4edf5; }
  .th-table tbody td { padding:0.55rem 0.75rem; border-bottom:1px solid #c8d8e8;
                       font-size:0.875rem; vertical-align:middle; }

  .actions-bar { display:flex; gap:0.75rem; align-items:center; margin-bottom:1.5rem; }
  .actions-bar form { margin:0; }

  .status-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:0.4rem; vertical-align:middle; }
  .status-running { background:#27ae60; }
  .status-stopped { background:#e74c3c; }
  .status-unknown { background:#95a5a6; }

  .pre-output { background:#1a3a5c; color:#e8e8e8; padding:1rem; border-radius:0.4rem;
                font-family:'Cascadia Code','Fira Code',monospace; font-size:0.8rem;
                white-space:pre-wrap; word-break:break-word; max-height:30rem; overflow-y:auto; }

  .form-row { display:flex; gap:1rem; }
  .form-row > * { flex:1; }
  .form-actions { display:flex; gap:0.75rem; margin-top:1rem; }

  details { margin-top:1rem; }
  details summary { cursor:pointer; font-weight:700; color:#1a5276; font-size:0.9rem; }
  details[open] summary { margin-bottom:0.75rem; }
  .checkbox-row { display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; }
  .checkbox-row input[type=checkbox] { width:auto; margin:0; }
  .checkbox-row label { display:inline; margin:0; text-transform:none; font-weight:600; font-size:0.9rem; }
`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageShell(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
    <title>${escapeHtml(title)}</title>
    <style>${PAGE_STYLES}</style>
  </head>
  <body>
    <div class="th-header">
      <div class="th-wordmark">${WORDMARK_SVG}</div>
      <div class="th-header-meta"><span class="accent">Management Console</span></div>
    </div>
    <div class="th-main">${body}</div>
  </body>
</html>`;
}

function flashHtml(msg, type) {
  if (!msg) return '';
  const cls = type === 'error' ? 'alert-error' : 'alert-success';
  return `<div class="alert ${cls}">${escapeHtml(msg)}</div>`;
}

function formatDomain(site) {
  if (!site.domain) return '—';
  return Array.isArray(site.domain) ? site.domain.join(', ') : site.domain;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function renderDashboard(sites, containerStatus, flash) {
  const siteNames = Object.keys(sites);

  const rows = siteNames.map((name) => {
    const site = sites[name] || {};
    const cs = containerStatus.get(name);
    const running = cs ? cs.running : false;
    const statusText = cs ? cs.status : 'not deployed';
    const dotClass = cs ? (running ? 'status-running' : 'status-stopped') : 'status-unknown';

    return `<tr>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td><a href="${escapeHtml(site.path || `/${name}`)}/">${escapeHtml(site.path || `/${name}`)}</a></td>
      <td>${escapeHtml(formatDomain(site))}</td>
      <td><span class="status-dot ${dotClass}"></span>${escapeHtml(statusText)}</td>
      <td>
        <a href="${BASE}/wikis/${encodeURIComponent(name)}/edit" class="btn btn-action btn-sm">Edit</a>
        <form method="POST" action="${BASE}/wikis/${encodeURIComponent(name)}/remove" style="display:inline;">
          <button type="submit" class="btn btn-danger btn-sm">Remove</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  const body = `
    ${flash ? flashHtml(flash.message, flash.type) : ''}
    <div class="actions-bar">
      <a href="${BASE}/wikis/add" class="btn btn-primary">Add Wiki</a>
      <form method="POST" action="${BASE}/apply">
        <button type="submit" class="btn btn-action">Apply Changes</button>
      </form>
    </div>
    <div class="th-card" style="padding:0; overflow:hidden; border-radius:0.6rem;">
      <table class="th-table">
        <thead><tr>
          <th>Name</th><th>Path</th><th>Domain</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#5d6d7e;">No wikis configured.</td></tr>'}</tbody>
      </table>
    </div>`;

  return pageShell('TiddlyHarbor Console', body);
}

// ─── Add / Edit Form ─────────────────────────────────────────────────────────

function siteForm({ action, name, site, defaults, error, isEdit }) {
  const v = site || {};
  const d = defaults || {};

  const nameField = isEdit
    ? `<h2 style="margin-top:0;">${escapeHtml(name)}</h2>`
    : `<div>
        <label>Site Name</label>
        <input type="text" name="name" value="${escapeHtml(v._name || '')}" pattern="[a-z][a-z0-9-]*" required
               placeholder="my-wiki">
      </div>`;

  const oauthVal = v.oauth_providers
    ? (v.oauth_providers === 'none' ? 'none' : (Array.isArray(v.oauth_providers) ? v.oauth_providers.join(', ') : String(v.oauth_providers)))
    : '';

  return `
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}
    <div class="th-card">
      <form method="POST" action="${escapeHtml(action)}">
      ${nameField}
        <div class="form-row">
          <div>
            <label>Path <span class="hint">URL path prefix</span></label>
            <input type="text" name="path" value="${escapeHtml(v.path || '')}" placeholder="/${escapeHtml(v._name || name || 'wiki-name')}">
          </div>
          <div>
            <label>Domain <span class="hint">comma-separated if multiple</span></label>
            <input type="text" name="domain" value="${escapeHtml(formatDomain(v) === '—' ? '' : formatDomain(v))}" placeholder="wiki.example.com">
          </div>
        </div>
        <div>
          <label>Git Remote URL <span class="hint">optional</span></label>
          <input type="text" name="repo" value="${escapeHtml(v.repo || '')}" placeholder="https://token@github.com/org/repo.git">
        </div>
        <div class="form-row">
          <div>
            <label>Admin Username <span class="hint">used on first start only</span></label>
            <input type="text" name="basic_auth_user" value="${escapeHtml(v.basic_auth_user || '')}" placeholder="admin" autocomplete="off">
          </div>
          <div>
            <label>Admin Password <span class="hint">${isEdit ? 'only applies on first start' : 'initial password (first start only)'}</span></label>
            <input type="text" name="basic_auth_pass" value="${escapeHtml(v.basic_auth_pass || '')}" placeholder="${isEdit ? '(unchanged)' : 'change-me-' + escapeHtml(name || 'wiki')}" autocomplete="off">
          </div>
        </div>

        <details>
          <summary>Advanced Settings</summary>
          <div class="form-row">
            <div class="checkbox-row">
              <input type="checkbox" id="public_read" name="public_read" ${(v.public_read !== undefined ? v.public_read : d.public_read !== false) ? 'checked' : ''}>
              <label for="public_read">Public read access</label>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="git_autosave_enabled" name="git_autosave_enabled" ${(v.git_autosave_enabled !== undefined ? v.git_autosave_enabled : d.git_autosave_enabled !== false) ? 'checked' : ''}>
              <label for="git_autosave_enabled">Git auto-save</label>
            </div>
            <div class="checkbox-row">
              <input type="checkbox" id="git_autopush" name="git_autopush" ${(v.git_autopush !== undefined ? v.git_autopush : d.git_autopush === true) ? 'checked' : ''}>
              <label for="git_autopush">Auto-push to remote</label>
            </div>
          </div>
          <div class="form-row">
            <div>
              <label>Quiescence (min) <span class="hint">default: ${d.quiescence_minutes || 5}</span></label>
              <input type="number" name="quiescence_minutes" value="${v.quiescence_minutes || ''}" placeholder="${d.quiescence_minutes || 5}" min="1">
            </div>
            <div>
              <label>Max commit interval (min) <span class="hint">default: ${d.max_commit_interval_minutes || 60}</span></label>
              <input type="number" name="max_commit_interval_minutes" value="${v.max_commit_interval_minutes || ''}" placeholder="${d.max_commit_interval_minutes || 60}" min="1">
            </div>
          </div>
          <div>
            <label>OAuth Providers <span class="hint">"default" = inherit, "none" = disable, or comma-separated list</span></label>
            <input type="text" name="oauth_providers" value="${escapeHtml(oauthVal)}" placeholder="default">
          </div>
        </details>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Wiki'}</button>
          <a href="${BASE}/" class="btn btn-link">Cancel</a>
        </div>
      </form>
    </div>`;
}

function renderAddForm(defaults, error, values) {
  const body = `<h1 style="font-size:1.25rem;">Add Wiki</h1>` +
    siteForm({ action: `${BASE}/wikis/add`, name: '', site: values, defaults, error, isEdit: false });
  return pageShell('Add Wiki — TiddlyHarbor Console', body);
}

function renderEditForm(name, site, defaults, error) {
  const body = `<h1 style="font-size:1.25rem;">Edit Wiki</h1>` +
    siteForm({ action: `${BASE}/wikis/${encodeURIComponent(name)}/edit`, name, site, defaults, error, isEdit: true });
  return pageShell(`Edit ${name} — TiddlyHarbor Console`, body);
}

// ─── Remove Confirmation ─────────────────────────────────────────────────────

function renderRemoveConfirm(name, site, siteCount) {
  if (siteCount <= 1) {
    const body = `
      <div class="alert alert-error">Cannot remove the last site.</div>
      <a href="${BASE}/" class="btn btn-primary">Back to Dashboard</a>`;
    return pageShell('Remove Wiki — TiddlyHarbor Console', body);
  }

  const body = `
    <div class="th-card">
      <h2 style="margin-top:0; color:#c0392b;">Remove "${escapeHtml(name)}"?</h2>
      <p><strong>Path:</strong> ${escapeHtml(site.path || `/${name}`)}</p>
      <p><strong>Domain:</strong> ${escapeHtml(formatDomain(site))}</p>
      <div class="alert alert-warning">
        This removes the wiki from the configuration. The Docker volume containing wiki data is <strong>not</strong> deleted.
        Run <code>docker volume rm</code> manually to delete data.
      </div>
      <div class="form-actions">
        <form method="POST" action="${BASE}/wikis/${encodeURIComponent(name)}/remove">
          <input type="hidden" name="confirm" value="yes">
          <button type="submit" class="btn btn-danger">Yes, Remove</button>
        </form>
        <a href="${BASE}/" class="btn btn-link">Cancel</a>
      </div>
    </div>`;
  return pageShell(`Remove ${name} — TiddlyHarbor Console`, body);
}

// ─── Apply Result ────────────────────────────────────────────────────────────

function renderApplyResult(success, stdout, stderr) {
  const output = [stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)';
  const body = `
    <h1 style="font-size:1.25rem;">Apply Changes</h1>
    ${success
      ? '<div class="alert alert-success">Configuration applied successfully.</div>'
      : '<div class="alert alert-error">Apply encountered errors. Check the output below.</div>'}
    <div class="pre-output">${escapeHtml(output)}</div>
    <div style="margin-top:1.5rem;">
      <a href="${BASE}/" class="btn btn-primary">Back to Dashboard</a>
    </div>`;
  return pageShell('Apply — TiddlyHarbor Console', body);
}

module.exports = {
  setBasePath,
  renderDashboard,
  renderAddForm,
  renderEditForm,
  renderRemoveConfirm,
  renderApplyResult
};
