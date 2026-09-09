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
  const email = options?.email ?? '';
  const emailParam = email ? `?email=${encodeURIComponent(email)}` : '';

  if (options?.pending) {
    return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>Payment received.</h1>
    <p class="hero-lead">Your license is being provisioned — this usually takes a few seconds.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <p>Refresh this page in a moment to see your license key and next steps.</p>
    ${email ? `<p style="color:var(--ink-muted)">Receipt: ${escapeHtml(email)}</p>` : ''}
  </div></section>`;
  }

  if (!options?.licenseKey) {
    return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>Payment received.</h1>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <p>Open this page with a valid Stripe <code>session_id</code> to see your license details, or check your email once provisioning completes.</p>
  </div></section>`;
  }

  const keyBlock = `
    <div style="margin-bottom:1.5rem;padding:1rem;background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem">
      <p style="margin:0 0 0.35rem;font-size:0.875rem;color:#166534"><strong>Your license key</strong> (saved to your account)</p>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <code style="font-size:0.9rem">${escapeHtml(options.licenseKey)}</code>
        <button type="button" onclick="navigator.clipboard.writeText('${escapeHtml(options.licenseKey)}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" style="font-size:0.75rem;padding:0.2rem 0.5rem;cursor:pointer">Copy</button>
      </div>
    </div>`;

  const accountCta = email ? `
    <div style="margin-top:1.5rem;padding:1rem;background:#f8fafc;border:1px solid var(--line);border-radius:0.5rem">
      <p style="margin:0 0 0.35rem"><strong>View this license in your account</strong></p>
      <p style="margin:0 0 0.75rem;color:var(--ink-muted);font-size:0.9rem">Log in or create a free account with <strong>${escapeHtml(email)}</strong> to manage your license and see activated sites.</p>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <a class="btn btn-primary" href="/community/register${emailParam}">Create account</a>
        <a class="btn btn-secondary" href="/community/login">Log in</a>
      </div>
    </div>` : '';

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>You're all set.</h1>
    <p class="hero-lead">Your site has been activated. Install the plugin and it will connect automatically.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${keyBlock}
    ${email ? `<p style="margin-bottom:1rem;color:var(--ink-muted)">Receipt: ${escapeHtml(email)}</p>` : ''}
    <ol>
      <li>Install WP Advertising on your WordPress site (<a href="/plugin/download">download</a>).</li>
      <li>In WP Advertising settings, set <strong>Community API URL</strong> to this service's <code>/v1</code> endpoint.</li>
      <li>The license status will show <strong>Active</strong> automatically — no key entry needed.</li>
    </ol>
    ${accountCta}
    <div class="hero-actions" style="margin-top:1.5rem">
      <a class="btn btn-primary" href="/plugin/download">Get the plugin</a>
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
  purchasedAt: Date;
  paidThrough: Date | null;
  activatedSites: string[];
};

export type ProfileSite = {
  id: string;
  siteUrl: string;
  siteDomain: string;
  siteName: string | null;
  networkStatus: string | null;
  networkAccessUntil: Date | null;
  optedIn: boolean;
  createdAt: Date;
};

function fmt(d: Date) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function profilePage(
  user: { displayName: string; email: string },
  licenses: ProfileLicense[],
  ownedSites: ProfileSite[] = [],
): string {
  const licenseContent = licenses.length === 0
    ? '<p style="color:var(--ink-muted)">No licenses found for this account.</p>'
    : licenses.map(l => {
        const statusColor = l.status === 'ACTIVE' ? '#166534' : '#9a3412';
        const statusBg   = l.status === 'ACTIVE' ? '#dcfce7' : '#ffedd5';
        const statusBorder = l.status === 'ACTIVE' ? '#86efac' : '#fdba74';
        const badge = `<strong style="color:${statusColor};background:${statusBg};border:1px solid ${statusBorder};padding:0.15rem 0.45rem;border-radius:3px;font-size:0.75rem;letter-spacing:0.04em">${escapeHtml(l.status)}</strong>`;
        const purchased = `<span style="color:var(--ink-muted);font-size:0.875rem">Purchased ${fmt(l.purchasedAt)}</span>`;
        const paid = l.paidThrough
          ? `<span style="color:var(--ink-muted);font-size:0.875rem">· Active through ${fmt(l.paidThrough)}</span>`
          : '';
        const sites = l.activatedSites.length
          ? `<p style="margin:0.5rem 0 0;font-size:0.875rem;color:var(--ink-muted)">Activated on: ${l.activatedSites.map(s => escapeHtml(s)).join(', ')}</p>`
          : '';
        const keyId = `key-${escapeHtml(l.licenseKey.slice(-6))}`;
        const keyBlock = `
          <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">
            <code id="${keyId}" style="font-size:0.8rem;letter-spacing:0.03em">${escapeHtml(l.licenseKey)}</code>
            <button type="button" onclick="navigator.clipboard.writeText('${escapeHtml(l.licenseKey)}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" style="font-size:0.75rem;padding:0.15rem 0.5rem;cursor:pointer">Copy</button>
          </div>`;
        return `<div style="padding:1rem;border:1px solid var(--line);border-radius:0.5rem;margin-bottom:0.75rem">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
            ${badge} ${purchased} ${paid}
          </div>
          ${keyBlock}${sites}
        </div>`;
      }).join('');

  const siteContent = ownedSites.length === 0 ? '' : `
    <h2 style="margin-top:2rem">Registered Sites</h2>
    ${ownedSites.map(s => {
      const status = s.networkStatus ?? 'unregistered';
      const accessLine = s.networkAccessUntil
        ? `<span style="color:var(--ink-muted);font-size:0.875rem">Access until ${fmt(s.networkAccessUntil)}</span>`
        : '';
      return `<div style="padding:1rem;border:1px solid var(--line);border-radius:0.5rem;margin-bottom:0.75rem">
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
          <strong>${escapeHtml(s.siteName ?? s.siteDomain)}</strong>
          <span style="color:var(--ink-muted);font-size:0.875rem">${escapeHtml(s.siteDomain)}</span>
          <code style="font-size:0.75rem;background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:3px">${escapeHtml(status)}</code>
          ${accessLine}
        </div>
        <p style="margin:0.25rem 0 0;font-size:0.8rem;color:var(--ink-muted)">Registered ${fmt(s.createdAt)}${s.optedIn ? ' · Community enabled' : ''}</p>
      </div>`;
    }).join('')}`;

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Account</p>
    <h1>${escapeHtml(user.displayName)}</h1>
    <p class="hero-lead">${escapeHtml(user.email)}</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <h2>Licenses</h2>
    ${licenseContent}
    ${siteContent}
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
