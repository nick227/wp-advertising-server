import { planChoices, type PlansConfig } from '../services/billingConfigService.js';

export function homePage(settings: PlansConfig): string {
  const plans = planChoices(settings);
  return `
  <section class="hero row wrap">
    <div class="">
      <p class="brand-mark">WP Advertising</p>
      <h1>Advertise your WooCommerce products.</h1>
      <p class="hero-lead">Build product ads in WordPress. Copy the embed and place them anywhere — your site, a blog, a partner page. Premium: your ads run on other WooCommerce stores too.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/plugin/download">Download the plugin</a>
        <a class="btn btn-secondary" href="#pricing">See pricing</a>
      </div>
    </div>
    <div class="hero-image">
      <img src="/assets/screenshot.png" alt="A WordPress plugin for ads on your site.">
    </div>
  </section>

  <section class="section row wrap" id="what-it-does">
    <div class="">
      <h2>What the plugin does</h2>
      <p class="section-lead">Build an ad in WordPress. Embed it anywhere.</p>
      <ul class="feature-list">
        <li>Create a product ad in your WordPress admin</li>
        <li>Promote one product or rotate through your catalog</li>
        <li>Copy the embed and place it on any page, site, or newsletter</li>
        <li>Pick a theme and preview before publishing</li>
        <li>Optional click and impression tracking</li>
      </ul>
    </div>
    <div class="example-ad">
      <div class="wp-advertising-zone" data-zone="house-ad" data-wpa-track="1"></div><script async src="https://hatsyshirtsy.com/wp-admin/admin-post.php?action=wp_advertising_embed_js&ver=8.3.0"></script>
    </div>
  </section>

  <section class="section" id="install" style="padding-top:0">
    <div class="wrap prose">
      <h2>Install</h2>
      <ol>
        <li>Download the plugin ZIP.</li>
        <li>In WordPress go to Plugins → Add New → Upload Plugin.</li>
        <li>Activate WP Advertising.</li>
        <li>Create an ad, copy the shortcode or embed, and place it on a page.</li>
      </ol>
      <p><a class="btn btn-primary" href="/plugin/download">Download plugin ZIP</a></p>
      <p class="muted">If the download button is not configured yet, use the ZIP from your release channel and upload it the same way.</p>
    </div>
  </section>

  <section class="section" id="pricing" style="padding-top:0">
    <div class="wrap">
      <h2>Pricing</h2>
      <p class="section-lead">Start free. Upgrade to reach other stores.</p>
      <div class="price-grid price-grid-two">
        <article class="price-card">
          <h3>Free</h3>
          <p class="amount">$0</p>
          <ul>
            <li>Build product ads in WordPress</li>
            <li>Embed them anywhere</li>
            <li>Optional tracking</li>
            <li>No account required</li>
          </ul>
          <a class="btn btn-secondary" href="/plugin/download">Download</a>
        </article>
        <article class="price-card featured">
          <h3>Premium</h3>
          <p class="amount">${plans.map((p) => p.label).join(' or ') || 'Pricing coming soon'}</p>
          <ul>
            <li>Everything in Free</li>
            <li>Join the Community Ad Network</li>
            <li>Your ad runs on other WooCommerce stores</li>
            ${settings.trialDays ? `<li>${settings.trialDays}-day free trial — no credit card</li>` : ''}
          </ul>
          <a class="btn btn-primary" href="/checkout">Get Premium</a>
        </article>
      </div>
      <p class="metric-note" style="margin-top:1rem">${settings.annualEnabled ? 'Annual billing available at checkout.' : ''}</p>
    </div>
  </section>

  <section class="section wrap row" id="community-ad-network" style="padding-top:0">
    <div class="">
      <h2>WooCommerce Community Ad Network</h2>
      <p class="section-lead">Connects your store to a rotating ad exchange with other WooCommerce sites. Your ad runs on their stores. Their ad runs on yours. No negotiations — it rotates automatically.</p>
      <ul class="feature-list">
        <li>Broadcast your products to shoppers on other participating stores</li>
        <li>Support fellow independent WooCommerce store owners</li>
        <li>Ads rotate on a fair, equal-exchange basis</li>
        <li>Free installs stay on your site only — the network is Premium</li>
      </ul>
    </div>
    <div class="">
      <img src="/assets/wooCommerce.webp" />
    </div>
  </section>

  <section class="section" id="download" style="padding-top:0">
    <div class="wrap cta-band">
      <div>
        <h2 style="margin:0 0 0.35rem;font-family:var(--font-display);letter-spacing:-0.03em;font-size:1.6rem">Download and install</h2>
        <p style="margin:0;color:var(--ink-muted)">Upload the ZIP in WordPress and create your first ad.</p>
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/plugin/download">Download the plugin</a>
      </div>
    </div>
  </section>`;
}

export function checkoutPage(settings: PlansConfig, options?: { configured?: boolean; canceled?: boolean }): string {
  const plans = planChoices(settings);
  const configured = Boolean(options?.configured && plans.length);
  const notice = options?.canceled
    ? '<div class="notice">Checkout was canceled. You can restart below whenever you are ready.</div>'
    : configured
      ? '<div class="notice">You will complete payment on Stripe. Premium activates after payment is confirmed.</div>'
      : `<div class="notice">Premium checkout is not available yet. You can still download Free.${settings.trialDays ? ` Try Premium for ${settings.trialDays} days from the plugin.` : ''}</div>`;

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>Get Premium</h1>
    <p class="hero-lead">Pay on Stripe. Then activate the license key in the WP Advertising plugin.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${notice}
    <form method="post" action="/checkout/session" style="margin-top:1.5rem;display:grid;gap:1rem;max-width:28rem">
      <label>WordPress site URL
        <input name="siteUrl" type="url" required placeholder="https://yoursite.com" style="display:block;width:100%;margin-top:0.35rem;padding:0.65rem;font:inherit">
      </label>
      <label>Email
        <input name="email" type="email" required placeholder="you@example.com" style="display:block;width:100%;margin-top:0.35rem;padding:0.65rem;font:inherit">
      </label>
      <label>Plan
        <select name="plan" style="display:block;width:100%;margin-top:0.35rem;padding:0.65rem;font:inherit">
          ${plans.map((p) => `<option value="${p.plan}">Premium ${p.label}</option>`).join('')}
        </select>
      </label>
      <button class="btn btn-primary" type="submit"${configured ? '' : ' disabled'}>Continue to Stripe</button>
    </form>
    <p style="color:var(--ink-muted)">On success you return to <a href="/checkout/success">/checkout/success</a> with your license key.</p>
  </div></section>`;
}

export function checkoutSuccessPage(options?: {
  licenseKey?: string | null;
  pending?: boolean;
  email?: string | null;
}): string {
  const licenseBlock = options?.licenseKey
    ? `<p><strong>License key</strong></p><p><code>${escapeHtml(options.licenseKey)}</code></p>
       <p class="muted">Copy this into WP Advertising → Network entitlement → License key → Activate Pro.</p>`
    : options?.pending
      ? '<div class="notice">Payment received. License provisioning is still in progress — refresh this page in a few seconds.</div>'
      : '<div class="notice">Open this page with a Stripe <code>session_id</code> after Checkout, or check your email once provisioning completes.</div>';

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>Payment received.</h1>
    <p class="hero-lead">Activate Premium on the same WordPress site URL you entered at checkout.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${licenseBlock}
    ${options?.email ? `<p style="color:var(--ink-muted)">Receipt email: ${escapeHtml(options.email)}</p>` : ''}
    <ol>
      <li>Install WP Advertising (<a href="/plugin/download">download</a>) on that WordPress site if it is not installed yet.</li>
      <li>Set Community API URL to this service’s <code>/v1</code> base.</li>
      <li>Paste the license key under Network entitlement and click <strong>Activate Pro</strong>.</li>
    </ol>
    <div class="hero-actions">
      <a class="btn btn-primary" href="/plugin/download">Get the plugin</a>
      <a class="btn btn-secondary" href="/#pricing">Back to pricing</a>
    </div>
  </div></section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ProfileLicense = {
  licenseKey: string;
  status: string;
  paidThrough: Date | null;
  activatedSites: string[];
};

export function profilePage(
  user: { displayName: string; email: string },
  licenses: ProfileLicense[],
): string {
  const licenseContent = licenses.length === 0
    ? '<p style="color:var(--ink-muted)">No licenses found for this account.</p>'
    : licenses.map(l => {
        const masked = `<code>••••${escapeHtml(l.licenseKey.slice(-8))}</code>`;
        const paid = l.paidThrough
          ? `<span style="color:var(--ink-muted);font-size:0.9rem">Paid through ${new Date(l.paidThrough).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>`
          : '';
        const sites = l.activatedSites.length
          ? `<p style="margin:0.5rem 0 0;font-size:0.875rem;color:var(--ink-muted)">${l.activatedSites.map(s => escapeHtml(s)).join(', ')}</p>`
          : '';
        return `<div style="padding:1rem;border:1px solid var(--line);border-radius:0.5rem;margin-bottom:0.75rem">
          <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
            ${masked}
            <strong>${escapeHtml(l.status)}</strong>
            ${paid}
          </div>${sites}
        </div>`;
      }).join('');

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Account</p>
    <h1>${escapeHtml(user.displayName)}</h1>
    <p class="hero-lead">${escapeHtml(user.email)}</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <h2>Licenses</h2>
    ${licenseContent}
    <h2 style="margin-top:2rem">Sign out</h2>
    <form method="post" action="/community/logout" style="margin:0">
      <button class="btn btn-secondary" type="submit">Log out</button>
    </form>
  </div></section>`;
}

export function legalPage(title: string, paragraphs: string[]): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Legal</p>
    <h1>${title}</h1>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${paragraphs.map((p) => `<p>${p}</p>`).join('')}
    <p style="color:var(--ink-muted)">This is a launch shell. Final counsel-reviewed copy will replace these placeholders before public Premium launch.</p>
  </div></section>`;
}

export function contactPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Contact</p>
    <h1>Support and partnerships.</h1>
    <p class="hero-lead">For product support, privacy requests, and Premium access.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <p>Email: <a href="mailto:support@wp-advertising.example">support@wp-advertising.example</a></p>
    <p>Privacy: <a href="mailto:privacy@wp-advertising.example">privacy@wp-advertising.example</a></p>
    <p>Replace these example addresses with production mailboxes before public launch.</p>
  </div></section>`;
}

export function statusPage(status: {
  overall: string;
  checkedAt: string;
  api: string;
  version: string;
  eligibleSites: number;
  activeAds: number;
  rotationAds: number;
  forumPosts: number;
  checkout: string;
}): string {
  const tone = status.overall === 'operational' ? 'ok' : 'warn';
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Status</p>
    <h1>Service status</h1>
    <p class="hero-lead">Aggregate soft-launch health — no publisher domains or license data on this page.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap">
    <div class="notice status-${tone}"><strong>${status.overall}</strong> · checked ${status.checkedAt} · v${status.version}</div>
    <div class="metrics-grid" style="margin-top:1.5rem">
      <div><span>API / DB</span><strong>${status.api}</strong></div>
      <div><span>Eligible sites</span><strong>${status.eligibleSites}</strong></div>
      <div><span>Active ads</span><strong>${status.activeAds}</strong></div>
      <div><span>Rotation cache ads</span><strong>${status.rotationAds}</strong></div>
      <div><span>Forum posts</span><strong>${status.forumPosts}</strong></div>
      <div><span>Checkout</span><strong>${status.checkout}</strong></div>
    </div>
    <p style="margin-top:1.5rem;color:var(--ink-muted)">Operators use authenticated <code>/v1/health</code> and admin metrics for deeper runtime detail.</p>
  </div></section>`;
}
