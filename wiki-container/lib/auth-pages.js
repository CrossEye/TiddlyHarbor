function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderWriterLoginPage({ wikiName, sitePrefix, errorMessage, nextPath }) {
  const safeError = errorMessage ? `<p style="color:#8b1e1e;background:#fce8e6;padding:0.75rem 1rem;border-radius:0.5rem;">${escapeHtml(errorMessage)}</p>` : '';
  const safeNextPath = nextPath ? escapeHtml(nextPath) : '';
  const hiddenNext = safeNextPath ? `<input name="next" type="hidden" value="${safeNextPath}">` : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TiddlyHarbor Writer Login</title>
  </head>
  <body style="margin:0;font-family:Georgia, 'Times New Roman', serif;background:#f4efe4;color:#1f2a44;">
    <main style="max-width:32rem;margin:4rem auto;padding:2rem;background:#fffdf8;border:1px solid #d8ccb0;border-radius:0.75rem;box-shadow:0 10px 30px rgba(31,42,68,0.08);">
      <h1 style="margin-top:0;">Writer Login</h1>
      <p>Authenticate once for write access to the ${escapeHtml(wikiName)} wiki. Reading remains public.</p>
      ${safeError}
      <form method="post" action="${sitePrefix}/login">
        ${hiddenNext}
        <label for="username" style="display:block;margin-bottom:0.35rem;">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" style="width:100%;padding:0.7rem;margin-bottom:1rem;border:1px solid #b5ab95;border-radius:0.5rem;box-sizing:border-box;">
        <label for="password" style="display:block;margin-bottom:0.35rem;">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" style="width:100%;padding:0.7rem;margin-bottom:1rem;border:1px solid #b5ab95;border-radius:0.5rem;box-sizing:border-box;">
        <button type="submit" style="padding:0.8rem 1.2rem;border:0;border-radius:0.5rem;background:#1f4b6e;color:#fff;cursor:pointer;">Sign In</button>
      </form>
      <p style="margin-top:1rem;"><a href="${sitePrefix}/" style="color:#1f4b6e;">Back to wiki</a></p>
    </main>
  </body>
</html>`;
}

function renderAdminPage({ wikiName, sitePrefix, currentUser, users, message, errorMessage }) {
  const safeMessage = message
    ? `<p style="color:#0f5132;background:#d1e7dd;padding:0.7rem 0.9rem;border-radius:0.4rem;">${escapeHtml(message)}</p>`
    : '';
  const safeError = errorMessage
    ? `<p style="color:#842029;background:#f8d7da;padding:0.7rem 0.9rem;border-radius:0.4rem;">${escapeHtml(errorMessage)}</p>`
    : '';

  const rows = users.map((user) => {
    const isSelf = currentUser && user.username === currentUser.username;
    const disableSelfAttr = isSelf ? 'disabled' : '';
    const activeOptionTrue = user.isActive ? 'selected' : '';
    const activeOptionFalse = !user.isActive ? 'selected' : '';
    const readerSelected = user.role === 'reader' ? 'selected' : '';
    const writerSelected = user.role === 'writer' ? 'selected' : '';
    const adminSelected = user.role === 'admin' ? 'selected' : '';

    return `
      <tr>
        <td style="padding:0.55rem;border-bottom:1px solid #e5e2d8;">${escapeHtml(user.username)}</td>
        <td style="padding:0.55rem;border-bottom:1px solid #e5e2d8;">${escapeHtml(user.role)}</td>
        <td style="padding:0.55rem;border-bottom:1px solid #e5e2d8;">${user.isActive ? 'active' : 'disabled'}</td>
        <td style="padding:0.55rem;border-bottom:1px solid #e5e2d8;">
          <form method="post" action="${sitePrefix}/admin" style="display:flex;gap:0.35rem;flex-wrap:wrap;">
            <input type="hidden" name="action" value="set-role">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <select name="role" ${disableSelfAttr}>
              <option value="reader" ${readerSelected}>reader</option>
              <option value="writer" ${writerSelected}>writer</option>
              <option value="admin" ${adminSelected}>admin</option>
            </select>
            <button type="submit" ${disableSelfAttr}>Set Role</button>
          </form>
          <form method="post" action="${sitePrefix}/admin" style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.35rem;">
            <input type="hidden" name="action" value="set-active">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <select name="isActive" ${disableSelfAttr}>
              <option value="true" ${activeOptionTrue}>active</option>
              <option value="false" ${activeOptionFalse}>disabled</option>
            </select>
            <button type="submit" ${disableSelfAttr}>Set Active</button>
          </form>
          <form method="post" action="${sitePrefix}/admin" style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.35rem;">
            <input type="hidden" name="action" value="set-password">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <input type="password" name="password" placeholder="new password" required>
            <button type="submit">Set Password</button>
          </form>
          <form method="post" action="${sitePrefix}/admin" style="display:inline-block;margin-top:0.35rem;">
            <input type="hidden" name="action" value="delete-user">
            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
            <button type="submit" ${disableSelfAttr}>Delete</button>
          </form>
        </td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TiddlyHarbor Admin</title>
  </head>
  <body style="margin:0;font-family:Georgia, 'Times New Roman', serif;background:#f3f1ea;color:#1f2a44;">
    <main style="max-width:68rem;margin:2rem auto;padding:1.4rem;background:#fffef9;border:1px solid #d8ccb0;border-radius:0.75rem;box-shadow:0 10px 30px rgba(31,42,68,0.08);">
      <header style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
        <div>
          <h1 style="margin:0 0 0.2rem 0;">Admin User Management</h1>
          <p style="margin:0;color:#4f5f7a;">Wiki: ${escapeHtml(wikiName)} | Signed in as ${escapeHtml(currentUser?.username || 'unknown')} (${escapeHtml(currentUser?.role || 'unknown')})</p>
        </div>
        <a href="${sitePrefix}/" style="color:#1f4b6e;">Back to wiki</a>
      </header>
      <section style="margin-top:1rem;">
        ${safeMessage}
        ${safeError}
      </section>
      <section style="margin-top:1rem;padding:0.9rem;border:1px solid #e0d8c3;border-radius:0.5rem;background:#faf7f0;">
        <h2 style="margin-top:0;">Create User</h2>
        <form method="post" action="${sitePrefix}/admin" style="display:flex;gap:0.45rem;flex-wrap:wrap;">
          <input type="hidden" name="action" value="create-user">
          <input type="text" name="username" placeholder="username" required>
          <input type="password" name="password" placeholder="password" required>
          <select name="role">
            <option value="reader">reader</option>
            <option value="writer" selected>writer</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">Create</button>
        </form>
      </section>
      <section style="margin-top:1rem;">
        <h2 style="margin-top:0;">Existing Users</h2>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;background:#fff;">
            <thead>
              <tr style="text-align:left;background:#f7f2e5;">
                <th style="padding:0.55rem;border-bottom:1px solid #d8ccb0;">Username</th>
                <th style="padding:0.55rem;border-bottom:1px solid #d8ccb0;">Role</th>
                <th style="padding:0.55rem;border-bottom:1px solid #d8ccb0;">Status</th>
                <th style="padding:0.55rem;border-bottom:1px solid #d8ccb0;">Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = {
  renderAdminPage,
  renderWriterLoginPage
};