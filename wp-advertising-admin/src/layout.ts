import { devAssetUrl, devReloadScript } from './devReload.js';
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPage(title: string, body: string, notice?: string): string {
  const flash = notice ? `<div class="notice">${escapeHtml(notice)}</div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — WP Advertising Admin</title>
  <link rel="stylesheet" href="${devAssetUrl('/assets/admin.css')}">
  ${devReloadScript()}
</head>
<body>
  <header class="top">
    <a class="brand" href="/">WP Advertising Admin</a>
    <nav>
      <a href="/">Overview</a>
      <a href="/sites">Sites</a>
      <a href="/ads">Ads</a>
      <a href="/licenses">Licenses</a>
      <a href="/community">Community</a>
      <a href="/system">System</a>
      <form method="post" action="/logout" class="inline"><button type="submit">Log out</button></form>
    </nav>
  </header>
  <main class="wrap">
    ${flash}
    ${body}
  </main>
</body>
</html>`;
}

export function renderLogin(error?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — WP Advertising Admin</title>
  <link rel="stylesheet" href="${devAssetUrl('/assets/admin.css')}">
  ${devReloadScript()}
</head>
<body class="login-body">
  <main class="login-card">
    <p class="brand-mark">WP Advertising</p>
    <h1>Owner admin</h1>
    <p class="lead">Sign in with the ad-server <code>ADMIN_TOKEN</code>. This UI has no database.</p>
    ${error ? `<div class="notice">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/login">
      <label>Admin token
        <input name="token" type="password" required autocomplete="current-password">
      </label>
      <button type="submit">Continue</button>
    </form>
  </main>
</body>
</html>`;
}
