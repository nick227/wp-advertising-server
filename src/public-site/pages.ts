export function homePage(): string {
  return `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <p class="brand-mark">WP Advertising</p>
        <h1>The advertising network built for WordPress.</h1>
        <p class="hero-lead">Local same-domain ads are free. External distribution and the WP Advertising Community run on Trial or Pro — without putting Railway URLs in visitor browsers.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/pricing">Start 30-Day Trial</a>
          <a class="btn btn-secondary" href="/plugin">Explore the Plugin</a>
        </div>
      </div>
      <figure class="network-visual" aria-label="Network exchange diagram">
        <svg viewBox="0 0 480 280" role="img" aria-hidden="true">
          <rect x="24" y="36" width="140" height="72" fill="#0b1f2a"/>
          <text x="40" y="78" fill="#e8eef2" font-size="14" font-family="IBM Plex Sans, sans-serif">Publisher WP</text>
          <rect x="316" y="36" width="140" height="72" fill="#0f5c4c"/>
          <text x="336" y="78" fill="#fff" font-size="14" font-family="IBM Plex Sans, sans-serif">Advertiser WP</text>
          <rect x="170" y="168" width="140" height="72" fill="#123447"/>
          <text x="186" y="210" fill="#e8eef2" font-size="14" font-family="IBM Plex Sans, sans-serif">Community API</text>
          <path d="M164 72 H316" stroke="#0f5c4c" stroke-width="2" fill="none"/>
          <path d="M94 108 V168 H170" stroke="#9db0bc" stroke-width="2" fill="none"/>
          <path d="M386 108 V168 H310" stroke="#9db0bc" stroke-width="2" fill="none"/>
          <circle cx="240" cy="72" r="4" fill="#0f5c4c"/>
        </svg>
        <figcaption>Server-to-server delivery. Visitors click advertiser destinations directly.</figcaption>
      </figure>
    </div>
  </section>

  <section class="metrics">
    <div class="wrap">
      <div class="metrics-grid">
        <div class="metric"><strong>—</strong><span>Network impressions</span></div>
        <div class="metric"><strong>—</strong><span>Participating sites</span></div>
        <div class="metric"><strong>—</strong><span>Advertiser clicks</span></div>
        <div class="metric"><strong>Beta</strong><span>Launch status</span></div>
      </div>
      <p class="metric-note">Live network totals appear here when the soft-launch inventory is online. We do not publish fabricated scale.</p>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <h2>Built for both sides of the exchange.</h2>
      <p class="section-lead">Advertisers gain reach beyond their own domain. Site owners contribute inventory and participate in a shared WordPress-native network.</p>
      <div class="split">
        <article>
          <h3>Advertisers</h3>
          <p>Distribute product and house creatives across participating WordPress properties. Reporting stays anonymized at the publisher identity level by default.</p>
        </article>
        <article>
          <h3>Site owners</h3>
          <p>Opt into Community when Trial or Pro is active. Free installs keep advertising local to the same WordPress domain — zero community-server cost.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <h2>How the network works</h2>
      <p class="section-lead">Entitled WordPress sites request community creatives server-to-server. Clicks go to the advertiser URL. Expired trials are removed from rotation on the server.</p>
      <div class="flow">
        <div class="flow-step"><strong>1. Activate</strong><span style="color:var(--ink-muted)">Start Trial when you enable external or community advertising.</span></div>
        <div class="flow-step"><strong>2. Contribute</strong><span style="color:var(--ink-muted)">Sync a house creative and opt into Community inventory.</span></div>
        <div class="flow-step"><strong>3. Rotate</strong><span style="color:var(--ink-muted)">Eligible sites receive partner ads from the memory-only serve cache.</span></div>
      </div>
    </div>
  </section>

  <section class="section panel">
    <div class="wrap panel-grid">
      <div>
        <h2>WooCommerce-native product advertising</h2>
        <p class="section-lead">Promote catalog products with WordPress-native creatives. Advanced automation and higher limits ship with Trial and Pro.</p>
        <a class="btn btn-ghost" href="/plugin">See plugin capabilities</a>
      </div>
      <div class="report-mock" aria-label="Anonymized reporting preview">
        <div class="row"><span>Impressions</span><strong>—</strong></div>
        <div class="row"><span>Clicks</span><strong>—</strong></div>
        <div class="row"><span>Publisher count</span><strong>—</strong></div>
        <div class="row"><span>Top placement</span><span class="muted">Publisher 01</span></div>
        <div class="row"><span>Identity policy</span><span class="muted">Anonymized</span></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <h2>A member Community, not a generic forum</h2>
      <p class="section-lead">Trial and Pro members discuss inventory fairness, publisher privacy, metrics definitions, and network standards. Expired members stay read-only.</p>
      <a class="btn btn-secondary" href="/community">Open Community</a>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap cta-band">
      <div>
        <h2 style="margin:0 0 0.35rem;font-family:var(--font-display);letter-spacing:-0.03em;font-size:1.6rem">Put your WordPress ads in motion.</h2>
        <p style="margin:0;color:var(--ink-muted)">30 days to try external embeds and Community participation.</p>
      </div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/pricing">Start 30-Day Trial</a>
        <a class="btn btn-secondary" href="/checkout">Go to Checkout</a>
      </div>
    </div>
  </section>`;
}

export function pluginPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Plugin</p>
    <h1>WordPress advertising that stays local until you expand.</h1>
    <p class="hero-lead">Free covers same-domain house ads, embeds, themes, and basic tracking. Trial and Pro unlock external distribution and Community network participation.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <h2>Free — local only</h2>
    <ul>
      <li>Create and rotate house ads on the installing domain</li>
      <li>Same-domain embeds and shortcodes</li>
      <li>Optional local impression and click tracking</li>
      <li>Never contacts the community server</li>
    </ul>
    <h2>Trial / Pro — network</h2>
    <ul>
      <li>External embeds beyond your domain</li>
      <li>Community opt-in, creative sync, and partner inventory</li>
      <li>Network reporting with anonymized publisher views</li>
      <li>Higher limits and advanced WooCommerce automation</li>
    </ul>
    <h2>Installation</h2>
    <ol>
      <li>Install WP Advertising on WordPress 6.2+ (PHP 7.4+).</li>
      <li>Create a house ad and copy the embed or shortcode.</li>
      <li>When ready for Community, activate Trial from Pricing and opt in inside the plugin.</li>
    </ol>
    <h2>FAQ</h2>
    <p><strong>Does Free phone home?</strong> No. Blank community API URL means local-only operation.</p>
    <p><strong>Where do community clicks go?</strong> Directly to the advertiser destination — not through Railway tracking URLs.</p>
    <p><strong>When does the trial start?</strong> When external or community advertising is first activated — not merely on plugin install.</p>
    <div class="cta-band" style="margin-top:2rem">
      <div><strong>Ready to distribute beyond one domain?</strong></div>
      <a class="btn btn-primary" href="/pricing">View Pricing</a>
    </div>
  </div></section>`;
}

export function pricingPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Pricing</p>
    <h1>Free locally. Trial and Pro for the network.</h1>
    <p class="hero-lead">One commercial plan after the 30-day trial. Stripe-hosted checkout arrives with billing launch; Trial activation ships with entitlement.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap">
    <div class="price-grid">
      <article class="price-card">
        <h3>Free — Local</h3>
        <p class="amount">$0</p>
        <ul>
          <li>Same-domain advertising</li>
          <li>Local embeds &amp; shortcodes</li>
          <li>No account required</li>
          <li>No community server usage</li>
        </ul>
        <a class="btn btn-secondary" href="/plugin">Explore Free</a>
      </article>
      <article class="price-card featured">
        <h3>Trial — 30 Days</h3>
        <p class="amount">$0</p>
        <ul>
          <li>External embeds</li>
          <li>Community network participation</li>
          <li>Network reporting</li>
          <li>Member Community access</li>
        </ul>
        <a class="btn btn-primary" href="/help/licensing">How trial starts</a>
      </article>
      <article class="price-card">
        <h3>Pro</h3>
        <p class="amount"><span data-price-amount data-monthly="$29/mo" data-annual="$290/yr">$29/mo</span></p>
        <div class="billing-toggle" role="group" aria-label="Billing period">
          <button type="button" data-billing="monthly" aria-pressed="true">Monthly</button>
          <button type="button" data-billing="annual" aria-pressed="false">Annual</button>
        </div>
        <ul>
          <li>Continued network access</li>
          <li>Advanced reporting &amp; exports</li>
          <li>Higher limits</li>
          <li>Premium WooCommerce automation</li>
        </ul>
        <a class="btn btn-primary" href="/checkout">Continue to Checkout</a>
      </article>
    </div>
    <p class="metric-note" style="margin-top:1rem">Displayed Pro prices are launch placeholders until Stripe products are connected.</p>
  </div></section>`;
}

export function checkoutPage(options?: { configured?: boolean; canceled?: boolean }): string {
  const configured = options?.configured ?? false;
  const notice = options?.canceled
    ? '<div class="notice">Checkout was canceled. You can restart below whenever you are ready.</div>'
    : configured
      ? '<div class="notice">You will complete payment on Stripe. Pro activates after the signed webhook confirms the subscription.</div>'
      : '<div class="notice">Pro checkout is not configured on this environment yet. Set Stripe keys and price IDs, or continue with Free local advertising.</div>';

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>Stripe-hosted checkout.</h1>
    <p class="hero-lead">Card entry happens on Stripe. This service only creates the Checkout Session.</p>
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
          <option value="monthly">Pro monthly</option>
          <option value="annual">Pro annual</option>
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
    ? `<p><strong>License key</strong></p><p><code>${escapeHtml(options.licenseKey)}</code></p>`
    : options?.pending
      ? '<div class="notice">Payment received. License provisioning is still in progress — refresh this page in a few seconds.</div>'
      : '<div class="notice">Open this page with a Stripe <code>session_id</code> after Checkout, or check your email once provisioning completes.</div>';

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Checkout</p>
    <h1>Payment received.</h1>
    <p class="hero-lead">Pro is tied to your WordPress site URL. Keep this license key for activation.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${licenseBlock}
    ${options?.email ? `<p style="color:var(--ink-muted)">Receipt email: ${escapeHtml(options.email)}</p>` : ''}
    <ol>
      <li>Install the WP Advertising plugin on the purchased site URL.</li>
      <li>Set the Community API URL to this service, then enable Community (server grants Pro from the webhook).</li>
      <li>Store your license key for support and future activation tooling.</li>
    </ol>
    <div class="hero-actions">
      <a class="btn btn-primary" href="/community">Enter Community</a>
      <a class="btn btn-secondary" href="/help/licensing">Licensing help</a>
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

export function communityPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Community</p>
    <h1>Member network for publishers and advertisers.</h1>
    <p class="hero-lead">Discussion, governance topics, and education for Trial and Pro members. The full forum ships after entitlement.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap">
    <div class="notice">Community posting is gated. Start a Trial or activate Pro to join. Expired members will keep read-only access to announcements.</div>
    <div class="split" style="margin-top:1.5rem">
      <article>
        <h3>Pinned topics</h3>
        <ul>
          <li>How inventory exchange works</li>
          <li>How impressions and clicks are counted</li>
          <li>Publisher privacy &amp; anonymized reporting</li>
          <li>High-traffic weighting discussion</li>
          <li>Publisher identity transparency</li>
          <li>Advertising standards &amp; roadmap</li>
        </ul>
      </article>
      <article>
        <h3>Access</h3>
        <p>Active Trial/Pro: read, post, comment, and participate in the ad network.</p>
        <p>Expired: read-only announcements, no network participation.</p>
        <a class="btn btn-primary" href="/pricing">Start 30-Day Trial</a>
      </article>
    </div>
  </div></section>`;
}

export function helpIndexPage(): string {
  const topics = [
    ['/help/getting-started', 'Getting started', 'Install, create a house ad, and understand Free vs Trial.'],
    ['/help/local-ads', 'Local ads', 'Same-domain advertising with zero community-server traffic.'],
    ['/help/community-network', 'Community network', 'Opt-in, serve path, and ghost-traffic protections.'],
    ['/help/woocommerce', 'WooCommerce', 'Product creatives and automation tiers.'],
    ['/help/embeds', 'Embeds', 'Same-domain vs external embed behavior.'],
    ['/help/tracking', 'Tracking', 'Local analytics and serve-path impressions.'],
    ['/help/licensing', 'Licensing', 'Trial start, Pro activation, and expiry.'],
    ['/help/billing', 'Billing', 'Stripe Checkout and subscription management.'],
    ['/help/privacy', 'Privacy', 'What data leaves a WordPress site.'],
    ['/help/troubleshooting', 'Troubleshooting', 'Common install and network issues.'],
  ] as const;

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Help</p>
    <h1>Documentation and support.</h1>
    <p class="hero-lead">Practical guides for local advertising, Community participation, licensing, and privacy.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap">
    <ul class="help-list">
      ${topics.map(([href, title, blurb]) => `<li><a href="${href}">${title}<span>${blurb}</span></a></li>`).join('')}
    </ul>
  </div></section>`;
}

export function helpArticle(title: string, body: string): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Help</p>
    <h1>${title}</h1>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">${body}
    <p><a href="/help">← All help topics</a></p>
  </div></section>`;
}

export function investorsPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Investors</p>
    <h1>WordPress advertising infrastructure with cost discipline.</h1>
    <p class="hero-lead">A two-sided network for independent publishers and advertisers — designed to stay cheap to operate until measured traffic forces scale.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <h2>Thesis</h2>
    <p>WordPress still powers a large share of the independent web, but native cross-site advertising tooling remains fragmented. WP Advertising pairs a free local plugin with an optional community network.</p>
    <h2>Flywheel</h2>
    <p>More entitled publishers contribute inventory; advertisers gain distribution; anonymized reporting builds trust; Community governance keeps rules transparent.</p>
    <h2>Business model</h2>
    <p>Free local usage creates distribution. Trial converts operators who need external reach. Pro subscriptions fund the community API.</p>
    <h2>Technology posture</h2>
    <p>One Node process, one SQL database, memory-only serve cache, aggregate analytics by default. No fabricated network metrics on this site.</p>
    <p><a class="btn btn-primary" href="/contact">Contact</a></p>
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
    <p style="color:var(--ink-muted)">This is a launch shell. Final counsel-reviewed copy will replace these placeholders before public Pro launch.</p>
  </div></section>`;
}

export function contactPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Contact</p>
    <h1>Support and partnerships.</h1>
    <p class="hero-lead">For product support, privacy requests, and early Pro access.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <p>Email: <a href="mailto:support@wp-advertising.example">support@wp-advertising.example</a></p>
    <p>Privacy: <a href="mailto:privacy@wp-advertising.example">privacy@wp-advertising.example</a></p>
    <p>Replace these example addresses with production mailboxes before public launch.</p>
  </div></section>`;
}

export function statusPage(): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Status</p>
    <h1>Service status</h1>
    <p class="hero-lead">Operational detail for the community API is available to operators via authenticated metrics. Public status expands at soft launch.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap">
    <div class="notice">Public incident history is not published yet. API health for operators: <code>GET /v1/health</code>.</div>
  </div></section>`;
}
