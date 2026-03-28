'use strict';

const path = require('path');
const fs = require('fs');

const LOGOS_DIR = path.join(__dirname, '../logos');
const WORDMARK_SVG = fs.readFileSync(path.join(LOGOS_DIR, 'wordmark-compact.svg'), 'utf8');
const FAVICON_DATA_URI = `data:image/svg+xml;base64,${
  Buffer.from(fs.readFileSync(path.join(LOGOS_DIR, 'favicon.svg'), 'utf8')).toString('base64')
}`;

// ─── TiddlyHarbor color tokens (sourced from brand SVGs) ───────────────────
// #0f2b44  deep navy   — header bg, headings
// #1a5276  port blue   — table headers, section accents
// #2e86ab  harbor blue — primary interactive (buttons, focus rings)
// #5dade2  sky blue    — "Tiddly" accent, links, badges
// #1a3a5c  midnight    — alternate dark
// #5d6d7e  dock grey   — muted / subtitle text
// #f4c542  gold        — connection accent (sparingly)
// #e8e8e8  off-white   — text on dark backgrounds

const PAGE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin:0; font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
         background:#dce6f0; color:#0f2b44; }

  /* ── Header ── */
  .th-header { background:#0f2b44; padding:0.6rem 1.5rem;
               display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .th-header a { color:#5dade2; text-decoration:none; font-size:0.85rem; }
  .th-header a:hover { color:#e8e8e8; }
  .th-header-meta { color:#e8e8e8; font-size:0.85rem; text-align:right; line-height:1.5; }
  .th-header-meta .accent { color:#5dade2; }
  /* Scale the inlined wordmark SVG to a fixed height */
  .th-wordmark svg { display:block; height:44px; width:auto; }

  /* ── Layout ── */
  .th-main { max-width:72rem; margin:2rem auto; padding:0 1rem 3rem; }
  .th-main-narrow { max-width:28rem; margin:3rem auto; padding:0 1rem; }

  /* ── Cards ── */
  .th-card { background:#fff; border:1px solid #b8cfe0; border-radius:0.75rem;
             box-shadow:0 4px 20px rgba(15,43,68,0.10); padding:2rem; }
  .th-section { background:#fff; border:1px solid #b8cfe0; border-radius:0.6rem;
                padding:1.25rem; margin-bottom:1.5rem; }
  .th-section h2 { margin-top:0; color:#0f2b44; font-size:1rem;
                   border-bottom:2px solid #2e86ab; padding-bottom:0.4rem; display:inline-block; }

  /* ── Alerts ── */
  .alert { padding:0.65rem 0.9rem; border-radius:0.4rem; margin-bottom:1rem; font-size:0.9rem; }
  .alert-success { color:#0a3d24; background:#d0f0e0; border-left:4px solid #27ae60; }
  .alert-error   { color:#5c0a12; background:#fde0e3; border-left:4px solid #e74c3c; }

  /* ── Forms ── */
  label { display:block; margin-bottom:0.25rem; font-size:0.8rem;
          font-weight:700; color:#1a3a5c; text-transform:uppercase; letter-spacing:0.04em; }
  input[type=text], input[type=password] {
    width:100%; padding:0.6rem 0.75rem; border:1px solid #94a3b8;
    border-radius:0.4rem; font-size:1rem; margin-bottom:1rem;
    transition:border-color 0.15s, box-shadow 0.15s; }
  input[type=text]:focus, input[type=password]:focus {
    outline:none; border-color:#2e86ab; box-shadow:0 0 0 3px rgba(46,134,171,0.18); }
  select { padding:0.45rem 0.6rem; border:1px solid #94a3b8; border-radius:0.4rem;
           font-size:0.85rem; background:#fff; color:#0f2b44; }
  select:disabled { opacity:0.45; cursor:not-allowed; }

  /* ── Buttons ── */
  .btn { display:inline-block; padding:0.55rem 1.1rem; border:0; border-radius:0.4rem;
         font-size:0.875rem; font-weight:700; cursor:pointer; transition:background 0.15s; }
  .btn:disabled { opacity:0.45; cursor:not-allowed; }
  .btn-primary  { background:#2e86ab; color:#fff; }
  .btn-primary:hover:not(:disabled)  { background:#1a5276; }
  .btn-action   { background:#1a3a5c; color:#e8e8e8; }
  .btn-action:hover:not(:disabled)   { background:#0f2b44; }
  .btn-danger   { background:#c0392b; color:#fff; }
  .btn-danger:hover:not(:disabled)   { background:#922b21; }
  .btn-sm { padding:0.3rem 0.65rem; font-size:0.78rem; }

  /* ── Role / status badges ── */
  .badge { display:inline-block; padding:0.2rem 0.55rem; border-radius:0.3rem;
           font-size:0.72rem; font-weight:700; letter-spacing:0.04em; }
  .badge-admin  { background:#0f2b44; color:#5dade2; }
  .badge-writer { background:#1a5276; color:#e8e8e8; }
  .badge-reader { background:#dce6f0; color:#1a3a5c; border:1px solid #94a3b8; }
  .badge-active   { background:#d0f0e0; color:#0a3d24; }
  .badge-disabled { background:#fde0e3; color:#5c0a12; }

  /* ── Table ── */
  .th-table { width:100%; border-collapse:collapse; }
  .th-table thead tr { background:#0f2b44; }
  .th-table thead th { padding:0.6rem 0.75rem; font-size:0.78rem; font-weight:700;
                       letter-spacing:0.06em; text-align:left; color:#e8e8e8; }
  .th-table tbody tr:nth-child(even) { background:#f0f5fa; }
  .th-table tbody tr:hover { background:#e4edf5; }
  .th-table tbody td { padding:0.55rem 0.75rem; border-bottom:1px solid #c8d8e8;
                       font-size:0.875rem; vertical-align:middle; }

  /* ── Inline forms inside table cells ── */
  .inline-form { display:flex; gap:0.35rem; align-items:center; margin:0; }
  input[type=password].pw-sm {
    padding:0.3rem 0.5rem; font-size:0.8rem; width:150px;
    margin-bottom:0; border:1px solid #94a3b8; border-radius:0.4rem; }
  input[type=password].pw-sm:focus {
    outline:none; border-color:#2e86ab; box-shadow:0 0 0 3px rgba(46,134,171,0.18); }
  .self-note { color:#5dade2; font-size:0.72rem; margin-left:0.3rem; }
`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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
  <body>${body}</body>
</html>`;
}

function renderWriterLoginPage({ wikiName, sitePrefix, errorMessage, nextPath }) {
  const safeError = errorMessage
    ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>`
    : '';
  const safeNextPath = nextPath ? escapeHtml(nextPath) : '';
  const hiddenNext = safeNextPath ? `<input name="next" type="hidden" value="${safeNextPath}">` : '';

  const body = `
    <header class="th-header">
      <div class="th-wordmark">${WORDMARK_SVG}</div>
    </header>
    <div class="th-main-narrow">
      <div class="th-card" style="margin-top:2rem;">
        <h2 style="margin-top:0;color:#0f2b44;border-bottom:2px solid #2e86ab;padding-bottom:0.4rem;">
          Sign in — <span style="color:#2e86ab;">${escapeHtml(wikiName)}</span>
        </h2>
        <p style="color:#5d6d7e;margin-top:0;font-size:0.9rem;">Authenticate for write access. Reading is public.</p>
        ${safeError}
        <form method="post" action="${sitePrefix}/login">
          ${hiddenNext}
          <label for="username">Username</label>
          <input id="username" name="username" type="text" autocomplete="username">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password">
          <button type="submit" class="btn btn-primary" style="width:100%;padding:0.75rem;font-size:1rem;">Sign In</button>
        </form>
        <p style="margin-top:1.25rem;font-size:0.875rem;">
          <a href="${sitePrefix}/" style="color:#2e86ab;">← Back to wiki</a>
        </p>
      </div>
    </div>`;

  return pageShell(`TiddlyHarbor — ${wikiName} Sign In`, body);
}

function renderAdminPage({ wikiName, sitePrefix, currentUser, users, message, errorMessage }) {
  const safeMessage = message
    ? `<div class="alert alert-success">${escapeHtml(message)}</div>`
    : '';
  const safeError = errorMessage
    ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>`
    : '';

  const rows = users.map((user) => {
    const isSelf = currentUser && user.username === currentUser.username;
    const disableSelfAttr = isSelf ? 'disabled' : '';
    const activeOptionTrue  = user.isActive  ? 'selected' : '';
    const activeOptionFalse = !user.isActive ? 'selected' : '';
    const readerSelected = user.role === 'reader' ? 'selected' : '';
    const writerSelected = user.role === 'writer' ? 'selected' : '';
    const adminSelected  = user.role === 'admin'  ? 'selected' : '';

    const roleBadge   = `<span class="badge badge-${escapeHtml(user.role)}">${escapeHtml(user.role)}</span>`;
    const statusBadge = user.isActive
      ? `<span class="badge badge-active">active</span>`
      : `<span class="badge badge-disabled">disabled</span>`;
    const selfNote = isSelf ? `<span class="self-note">(you)</span>` : '';

    return `
      <tr>
        <td><strong>${escapeHtml(user.username)}</strong>${selfNote}</td>
        <td>
          <form method="post" action="${sitePrefix}/admin" class="inline-form">
            <input type="hidden" name="action" value="set-role">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <select name="role" ${disableSelfAttr}>
              <option value="reader" ${readerSelected}>reader</option>
              <option value="writer" ${writerSelected}>writer</option>
              <option value="admin"  ${adminSelected}>admin</option>
            </select>
            <button type="submit" class="btn btn-sm btn-action" ${disableSelfAttr}>Set</button>
          </form>
        </td>
        <td>
          <form method="post" action="${sitePrefix}/admin" class="inline-form">
            <input type="hidden" name="action" value="set-active">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <select name="isActive" ${disableSelfAttr}>
              <option value="true"  ${activeOptionTrue}>active</option>
              <option value="false" ${activeOptionFalse}>disabled</option>
            </select>
            <button type="submit" class="btn btn-sm btn-action" ${disableSelfAttr}>Set</button>
          </form>
        </td>
        <td>
          <form method="post" action="${sitePrefix}/admin" class="inline-form">
            <input type="hidden" name="action" value="set-password">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <input type="password" name="password" placeholder="new password" class="pw-sm" required>
            <button type="submit" class="btn btn-sm btn-action">Set</button>
          </form>
        </td>
        <td>
          <form method="post" action="${sitePrefix}/admin" class="inline-form">
            <input type="hidden" name="action" value="delete-user">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <button type="submit" class="btn btn-sm btn-danger" ${disableSelfAttr}>Delete</button>
          </form>
        </td>
      </tr>`;
  }).join('');

  const body = `
    <header class="th-header">
      <div class="th-wordmark">${WORDMARK_SVG}</div>
      <div class="th-header-meta">
        ${escapeHtml(currentUser?.username || '')}
        <span class="accent">(${escapeHtml(currentUser?.role || '')})</span><br>
        <a href="${sitePrefix}/">← Back to wiki</a>
      </div>
    </header>
    <div class="th-main">
      <div style="margin:1.5rem 0 1.25rem;">
        <h1 style="margin:0 0 0.2rem;color:#0f2b44;font-size:1.5rem;">User Management</h1>
        <p style="margin:0;color:#5d6d7e;font-size:0.875rem;">
          Wiki: <strong style="color:#2e86ab;">${escapeHtml(wikiName)}</strong>
        </p>
      </div>
      ${safeMessage}${safeError}
      <div class="th-section">
        <h2>Add New User</h2>
        <form method="post" action="${sitePrefix}/admin"
              style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:flex-end;margin-top:0.75rem;">
          <input type="hidden" name="action" value="create-user">
          <div>
            <label>Username</label>
            <input type="text" name="username" placeholder="username" required
                   style="width:160px;margin-bottom:0;">
          </div>
          <div>
            <label>Password</label>
            <input type="password" name="password" placeholder="password" required
                   style="width:160px;margin-bottom:0;">
          </div>
          <div>
            <label>Role</label>
            <select name="role">
              <option value="reader">reader</option>
              <option value="writer" selected>writer</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Create User</button>
        </form>
      </div>
      <div class="th-section">
        <h2>Users</h2>
        <div style="overflow-x:auto;border:1px solid #b8cfe0;border-radius:0.4rem;overflow:hidden;margin-top:0.75rem;">
          <table class="th-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Password</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  return pageShell(`TiddlyHarbor Admin — ${wikiName}`, body);
}

module.exports = {
  renderAdminPage,
  renderWriterLoginPage,
};