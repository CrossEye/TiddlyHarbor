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
  input[type=text], input[type=password], input[type=email] {
    width:100%; padding:0.6rem 0.75rem; border:1px solid #94a3b8;
    border-radius:0.4rem; font-size:1rem; margin-bottom:1rem;
    transition:border-color 0.15s, box-shadow 0.15s; }
  input[type=text]:focus, input[type=password]:focus, input[type=email]:focus {
    outline:none; border-color:#2e86ab; box-shadow:0 0 0 3px rgba(46,134,171,0.18); }
  select { padding:0.6rem 0.75rem; border:1px solid #94a3b8; border-radius:0.4rem;
           font-size:1rem; background:#fff; color:#0f2b44; }
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
  .badge-pending { background:#fef3cd; color:#856404; border:1px solid #f0d86e; }
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

const OAUTH_BUTTON_STYLES = {
  github: { bg: '#24292e', hover: '#1b1f23', icon: `<svg viewBox="0 0 16 16" width="18" height="18" fill="#fff" style="vertical-align:middle;margin-right:0.5rem;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>` },
  google: { bg: '#4285F4', hover: '#357ae8', icon: `<svg viewBox="0 0 18 18" width="18" height="18" style="vertical-align:middle;margin-right:0.5rem;"><path fill="#fff" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#fff" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#fff" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9s0 0 0 0a9 9 0 00.957 4.042l3.007-2.332z"/><path fill="#fff" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>` }
};

function renderOAuthButtons(providers, sitePrefix, nextPath) {
  if (!providers || providers.length === 0) {
    return '';
  }

  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
  const buttons = providers.map((p) => {
    const style = OAUTH_BUTTON_STYLES[p.name] || { bg: '#333', hover: '#222', icon: '' };
    return `<a href="${sitePrefix}/auth/${escapeHtml(p.name)}${nextQuery}"
               class="btn" style="display:flex;align-items:center;justify-content:center;
               width:100%;padding:0.75rem;font-size:1rem;background:${style.bg};color:#fff;
               text-decoration:none;margin-bottom:0.5rem;"
               onmouseover="this.style.background='${style.hover}'"
               onmouseout="this.style.background='${style.bg}'">
              ${style.icon}Sign in with ${escapeHtml(p.displayName || p.name)}
            </a>`;
  }).join('');

  return `
    <div style="margin:1.25rem 0 0.75rem;display:flex;align-items:center;gap:0.75rem;">
      <hr style="flex:1;border:none;border-top:1px solid #b8cfe0;">
      <span style="color:#5d6d7e;font-size:0.8rem;white-space:nowrap;">or sign in with</span>
      <hr style="flex:1;border:none;border-top:1px solid #b8cfe0;">
    </div>
    ${buttons}`;
}

function renderWriterLoginPage({ wikiName, sitePrefix, errorMessage, successMessage, nextPath, enabledProviders, smtpConfigured }) {
  const safeError = errorMessage
    ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>`
    : '';
  const safeSuccess = successMessage
    ? `<div class="alert alert-success">${escapeHtml(successMessage)}</div>`
    : '';
  const safeNextPath = nextPath ? escapeHtml(nextPath) : '';
  const hiddenNext = safeNextPath ? `<input name="next" type="hidden" value="${safeNextPath}">` : '';
  const oauthButtons = renderOAuthButtons(enabledProviders, sitePrefix, nextPath);

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
        ${safeSuccess}${safeError}
        <form method="post" action="${sitePrefix}/login">
          ${hiddenNext}
          <label for="username">Username</label>
          <input id="username" name="username" type="text" autocomplete="username">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password">
          ${smtpConfigured ? `<p style="margin:-0.5rem 0 1rem;text-align:right;"><a href="${sitePrefix}/forgot-password" style="color:#2e86ab;font-size:0.85rem;">Forgot password?</a></p>` : ''}
          <button type="submit" class="btn btn-primary" style="width:100%;padding:0.75rem;font-size:1rem;">Sign In</button>
        </form>
        ${oauthButtons}
        <p style="margin-top:1.25rem;font-size:0.875rem;">
          <a href="${sitePrefix}/" style="color:#2e86ab;">← Back to wiki</a>
        </p>
      </div>
    </div>`;

  return pageShell(`TiddlyHarbor — ${wikiName} Sign In`, body);
}

function renderAdminPage({ wikiName, sitePrefix, currentUser, users, message, errorMessage, smtpConfigured }) {
  const safeMessage = message
    ? `<div class="alert alert-success">${escapeHtml(message)}</div>`
    : '';
  const safeError = errorMessage
    ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>`
    : '';

  const pendingUsers = users.filter((u) => u.role === 'pending');
  const allUsers = users;

  function userRow(user) {
    const isSelf = currentUser && user.username === currentUser.username;
    const disableSelfAttr = isSelf ? 'disabled' : '';
    const activeOptionTrue  = user.isActive  ? 'selected' : '';
    const activeOptionFalse = !user.isActive ? 'selected' : '';
    const pendingSelected = user.role === 'pending' ? 'selected' : '';
    const readerSelected = user.role === 'reader' ? 'selected' : '';
    const writerSelected = user.role === 'writer' ? 'selected' : '';
    const adminSelected  = user.role === 'admin'  ? 'selected' : '';

    const selfNote = isSelf ? `<span class="self-note">(you)</span>` : '';
    const providerInfo = user.oauthProvider
      ? `<span style="color:#5d6d7e;font-size:0.75rem;display:block;">${escapeHtml(user.oauthProvider)}</span>`
      : '';

    return `
      <tr>
        <td>
          <strong>${escapeHtml(user.displayName || user.username)}</strong>${selfNote}
          ${providerInfo}
        </td>
        <td>
          <form method="post" action="${sitePrefix}/admin" class="inline-form">
            <input type="hidden" name="action" value="set-email">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <input type="email" name="email" value="${escapeHtml(user.email || '')}" placeholder="—"
                   style="width:180px;margin-bottom:0;padding:0.3rem 0.5rem;font-size:0.8rem;">
            <button type="submit" class="btn btn-sm btn-action">Set</button>
          </form>
        </td>
        <td>
          <form method="post" action="${sitePrefix}/admin" class="inline-form">
            <input type="hidden" name="action" value="set-role">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <select name="role" ${disableSelfAttr}>
              <option value="pending" ${pendingSelected}>pending</option>
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
  }

  const rows = allUsers.map(userRow).join('');

  const pendingSection = pendingUsers.length > 0 ? `
      <div class="th-section" style="border-left:4px solid #f0d86e;">
        <h2>Pending Approvals (${pendingUsers.length})</h2>
        <p style="margin:0.25rem 0 0.75rem;color:#5d6d7e;font-size:0.85rem;">
          These users signed in via OAuth and are awaiting approval.
        </p>
        ${pendingUsers.map((u) => {
          const display = u.displayName || u.username;
          const emailNote = u.email ? ` (${escapeHtml(u.email)})` : '';
          const providerNote = u.oauthProvider ? `via ${escapeHtml(u.oauthProvider)}` : '';
          return `
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid #e8e8e8;">
              <div style="flex:1;">
                <strong>${escapeHtml(display)}</strong>${emailNote}
                <span style="color:#5d6d7e;font-size:0.78rem;margin-left:0.5rem;">${providerNote}</span>
              </div>
              <form method="post" action="${sitePrefix}/admin" class="inline-form">
                <input type="hidden" name="action" value="set-role">
                <input type="hidden" name="username" value="${escapeHtml(u.username)}">
                <input type="hidden" name="role" value="writer">
                <button type="submit" class="btn btn-sm btn-primary">Approve</button>
              </form>
              <form method="post" action="${sitePrefix}/admin" class="inline-form">
                <input type="hidden" name="action" value="delete-user">
                <input type="hidden" name="username" value="${escapeHtml(u.username)}">
                <button type="submit" class="btn btn-sm btn-danger">Reject</button>
              </form>
            </div>`;
        }).join('')}
      </div>` : '';

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
      ${pendingSection}
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
            <label>Email</label>
            <input type="email" name="email" placeholder="user@example.com"
                   style="width:200px;margin-bottom:0;">
          </div>
          <div>
            <label>Password <span style="font-weight:400;text-transform:none;font-size:0.75rem;color:#5d6d7e;">optional</span></label>
            <input type="password" name="password" placeholder="${smtpConfigured ? 'blank = send invite' : 'password'}"
                   style="width:160px;margin-bottom:0;"${smtpConfigured ? '' : ' required'}>
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
        ${smtpConfigured ? '<p style="margin:0.5rem 0 0;font-size:0.8rem;color:#5d6d7e;">Leave password blank to send an invite email instead.</p>' : ''}
      </div>
      <div class="th-section">
        <h2>Users</h2>
        <div style="overflow-x:auto;border:1px solid #b8cfe0;border-radius:0.4rem;overflow:hidden;margin-top:0.75rem;">
          <table class="th-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
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

function renderSetPasswordPage({ wikiName, sitePrefix, username, token, tokenType, errorMessage }) {
  const safeError = errorMessage
    ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>`
    : '';

  const heading = tokenType === 'invite'
    ? `Welcome to <span style="color:#2e86ab;">${escapeHtml(wikiName)}</span>`
    : `Reset password — <span style="color:#2e86ab;">${escapeHtml(wikiName)}</span>`;
  const subtitle = tokenType === 'invite'
    ? 'Set your password to get started.'
    : 'Enter your new password.';

  const body = `
    <header class="th-header">
      <div class="th-wordmark">${WORDMARK_SVG}</div>
    </header>
    <div class="th-main-narrow">
      <div class="th-card" style="margin-top:2rem;">
        <h2 style="margin-top:0;color:#0f2b44;border-bottom:2px solid #2e86ab;padding-bottom:0.4rem;">
          ${heading}
        </h2>
        <p style="color:#5d6d7e;margin-top:0;font-size:0.9rem;">${subtitle}</p>
        ${safeError}
        <form method="post" action="${sitePrefix}/set-password">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <label>Username</label>
          <div style="padding:0.6rem 0.75rem;background:#f0f5fa;border:1px solid #dce6f0;border-radius:0.4rem;margin-bottom:1rem;font-size:1rem;color:#0f2b44;font-weight:600;">
            ${escapeHtml(username)}
          </div>
          <label for="password">New Password</label>
          <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8">
          <label for="password_confirm">Confirm Password</label>
          <input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password" required minlength="8">
          <button type="submit" class="btn btn-primary" style="width:100%;padding:0.75rem;font-size:1rem;">Set Password</button>
        </form>
        <p style="margin-top:1.25rem;font-size:0.875rem;">
          <a href="${sitePrefix}/login" style="color:#2e86ab;">← Back to sign in</a>
        </p>
      </div>
    </div>`;

  return pageShell(`Set Password — ${wikiName}`, body);
}

function renderForgotPasswordPage({ wikiName, sitePrefix, successMessage, errorMessage }) {
  const safeSuccess = successMessage
    ? `<div class="alert alert-success">${escapeHtml(successMessage)}</div>`
    : '';
  const safeError = errorMessage
    ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>`
    : '';

  const body = `
    <header class="th-header">
      <div class="th-wordmark">${WORDMARK_SVG}</div>
    </header>
    <div class="th-main-narrow">
      <div class="th-card" style="margin-top:2rem;">
        <h2 style="margin-top:0;color:#0f2b44;border-bottom:2px solid #2e86ab;padding-bottom:0.4rem;">
          Forgot password — <span style="color:#2e86ab;">${escapeHtml(wikiName)}</span>
        </h2>
        <p style="color:#5d6d7e;margin-top:0;font-size:0.9rem;">
          Enter your email and we'll send a link to reset your password.
        </p>
        ${safeSuccess}${safeError}
        ${!successMessage ? `
        <form method="post" action="${sitePrefix}/forgot-password">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required>
          <button type="submit" class="btn btn-primary" style="width:100%;padding:0.75rem;font-size:1rem;">Send Reset Link</button>
        </form>` : ''}
        <p style="margin-top:1.25rem;font-size:0.875rem;">
          <a href="${sitePrefix}/login" style="color:#2e86ab;">← Back to sign in</a>
        </p>
      </div>
    </div>`;

  return pageShell(`Forgot Password — ${wikiName}`, body);
}

function renderTokenErrorPage({ wikiName, sitePrefix, message }) {
  const body = `
    <header class="th-header">
      <div class="th-wordmark">${WORDMARK_SVG}</div>
    </header>
    <div class="th-main-narrow">
      <div class="th-card" style="margin-top:2rem;">
        <div class="alert alert-error">${escapeHtml(message)}</div>
        <p style="font-size:0.875rem;">
          <a href="${sitePrefix}/login" style="color:#2e86ab;">← Back to sign in</a>
        </p>
      </div>
    </div>`;

  return pageShell(`Link Expired — ${wikiName}`, body);
}

module.exports = {
  renderAdminPage,
  renderForgotPasswordPage,
  renderSetPasswordPage,
  renderTokenErrorPage,
  renderWriterLoginPage,
};