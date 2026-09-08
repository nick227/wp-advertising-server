export function homePage(): string {
  return `
  <section class="hero row wrap">
    <div class="">
      <p class="brand-mark">WP Advertising</p>
      <h1>Advertise your WooCommerce products.</h1>
      <p class="hero-lead">Create house ads, promote WooCommerce products, place them with embeds or shortcodes, and optionally track impressions and clicks. Download it, upload it in WordPress, and start.</p>
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
      <p class="section-lead">After you install it, you can do these things in WordPress:</p>
      <ul class="feature-list">
        <li>Create custom house ads with a label, headline, body, image, and button</li>
        <li>Promote specific WooCommerce products, or rotate products from your catalog</li>
        <li>Pick a visual theme for each ad</li>
        <li>Preview ads in the admin before you publish them</li>
        <li>Place ads with a shortcode or an embed snippet</li>
        <li>Turn on local tracking for impressions and clicks, or leave tracking off</li>
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
      <p class="section-lead">Two options. No account is required to use Free.</p>
      <div class="price-grid price-grid-two">
        <article class="price-card">
          <h3>Free</h3>
          <p class="amount">$0</p>
          <ul>
            <li>Ads on your own WordPress site</li>
            <li>Themes, shortcodes, and embeds on your domain</li>
            <li>Optional local tracking</li>
            <li>No credit card</li>
          </ul>
          <a class="btn btn-secondary" href="/plugin/download">Download</a>
        </article>
        <article class="price-card featured">
          <h3>Premium</h3>
          <p class="amount">$29/mo</p>
          <ul>
            <li>Everything in Free</li>
            <li>Optional shared community ads with other sites</li>
            <li>Try Premium for 30 days — no credit card</li>
            <li>After the trial, pay through Checkout and activate your license in WordPress</li>
          </ul>
          <a class="btn btn-primary" href="/checkout">Get Premium</a>
        </article>
      </div>
      <p class="metric-note" style="margin-top:1rem">The 30-day trial starts in the plugin when you turn on Premium features. You do not need a card to start the trial. Annual billing is available at checkout.</p>
    </div>
  </section>

  <section class="section" id="community-ads" style="padding-top:0">
    <div class="wrap">
      <h2>Optional: share ads with other sites</h2>
      <p class="section-lead">Premium can connect your site so you show an ad from another opted-in site and share one of yours in return. Free installs stay on your site only.</p>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <h2>Community</h2>
      <p class="section-lead">A discussion space for people using the plugin. Create a free account with email and password to post.</p>
      <a class="btn btn-secondary" href="/community">Open Community</a>
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

export function checkoutPage(options?: { configured?: boolean; canceled?: boolean }): string {
  const configured = options?.configured ?? false;
  const notice = options?.canceled
    ? '<div class="notice">Checkout was canceled. You can restart below whenever you are ready.</div>'
    : configured
      ? '<div class="notice">You will complete payment on Stripe. Premium activates after payment is confirmed.</div>'
      : '<div class="notice">Premium checkout is not configured on this environment yet. You can still download Free and try Premium features for 30 days from the plugin.</div>';

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
          <option value="monthly">Premium monthly</option>
          <option value="annual">Premium annual</option>
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
