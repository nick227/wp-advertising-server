import { devAssetUrl, devReloadScript } from '../devReload.js';
export type PageMeta = {
  title: string;
  description: string;
  path: string;
};

export type NavUser = {
  displayName: string;
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/community', label: 'Community' },
] as const;

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function navHtml(currentPath: string, user?: NavUser | null): string {
  const items = NAV.map((item) => {
    const current = item.href === currentPath || (item.href !== '/' && currentPath.startsWith(item.href))
      ? ' aria-current="page"'
      : '';
    return `<li><a href="${item.href}"${current}>${item.label}</a></li>`;
  }).join('');

  const account = user
    ? `<li class="nav-user"><span>${esc(user.displayName)}</span>
        <form method="post" action="/community/logout" class="nav-logout">
          <button class="btn btn-ghost" type="submit">Log out</button>
        </form></li>`
    : '';

  return `
  <header class="site-header">
    <div class="wrap nav">
      <a class="brand" href="/">WP <span>Advertising</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <ul class="nav-links" id="site-nav">${items}${account}
        <li><a class="btn btn-primary" href="/plugin/download">Download</a></li>
      </ul>
    </div>
  </header>`;
}

function footerHtml(): string {
  return `
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div>
        <h2>WP Advertising</h2>
        <p style="color:var(--ink-muted);margin:0;max-width:28rem">
          A WordPress plugin for house ads, product ads, and optional shared community ads.
        </p>
      </div>
      <div>
        <h2>Product</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/community">Community</a></li>
          <li><a href="/checkout">Checkout</a></li>
        </ul>
      </div>
      <div>
        <h2>Help</h2>
        <ul>
          <li><a href="/#install">Install</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/status">Status</a></li>
        </ul>
      </div>
      <div>
        <h2>Legal</h2>
        <ul>
          <li><a href="/privacy">Privacy</a></li>
          <li><a href="/terms">Terms</a></li>
          <li><a href="/community-standards">Community standards</a></li>
          <li><a href="/refunds">Refunds</a></li>
        </ul>
      </div>
    </div>
    <div class="wrap footer-note">© ${new Date().getUTCFullYear()} WP Advertising</div>
  </footer>`;
}

export function renderPage(meta: PageMeta, body: string, user?: NavUser | null): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${devAssetUrl('/assets/site.css')}">
  ${devReloadScript()}
</head>
<body>
  ${navHtml(meta.path, user)}
  <main>${body}</main>
  ${footerHtml()}
  <script src="${devAssetUrl('/assets/site.js')}" defer></script>
</body>
</html>`;
}
