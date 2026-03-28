function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderWriterLoginPage({ wikiName, sitePrefix, errorMessage }) {
  const safeError = errorMessage ? `<p style="color:#8b1e1e;background:#fce8e6;padding:0.75rem 1rem;border-radius:0.5rem;">${escapeHtml(errorMessage)}</p>` : '';
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

module.exports = {
  renderWriterLoginPage
};