import { escapeHtml } from './layout.js';

function fmt(value: string | null | undefined) {
  if (!value) return '—';
  return escapeHtml(new Date(value).toISOString());
}

type Overview = {
  counts: {
    sites: number;
    optedIn: number;
    ads: number;
    activeLicenses: number;
    serves: number;
    clicks: number;
    ctr: number;
  };
  networkStatus: Record<string, number>;
  topAds: Array<{
    id: string;
    title: string;
    servedCount: number;
    clickCount: number;
    status: string;
    site?: { siteDomain?: string; siteUrl?: string };
  }>;
  recentSites: Array<{
    id: string;
    siteDomain: string;
    networkStatus: string | null;
    optedIn: boolean;
    lastSeenAt: string | null;
  }>;
  rotation: { items?: number; sites?: number; lastError?: string | null };
  events: { size?: number; dropped?: number };
  softLaunch?: {
    ready: boolean;
    checks: Record<string, boolean>;
    counts: Record<string, number>;
  };
};

export function overviewBody(data: Overview): string {
  const network = Object.entries(data.networkStatus)
    .map(([k, v]) => `<div class="stat"><span class="muted">${escapeHtml(k)}</span><strong>${v}</strong></div>`)
    .join('');
  const topAds = (data.topAds || []).map((a) => `
    <tr>
      <td>${escapeHtml(a.title)}<div class="muted mono">${escapeHtml(a.site?.siteDomain ?? '')}</div></td>
      <td>${escapeHtml(a.status)}</td>
      <td>${a.servedCount}</td>
      <td>${a.clickCount}</td>
    </tr>`).join('');
  const recent = (data.recentSites || []).map((s) => `
    <tr>
      <td><a href="/sites/${encodeURIComponent(s.id)}">${escapeHtml(s.siteDomain)}</a></td>
      <td>${escapeHtml(s.networkStatus ?? 'NONE')}</td>
      <td>${s.optedIn ? 'yes' : 'no'}</td>
      <td class="mono">${fmt(s.lastSeenAt)}</td>
    </tr>`).join('');
  const soft = data.softLaunch
    ? Object.entries(data.softLaunch.checks)
      .map(([k, ok]) => `<li>${ok ? '✓' : '○'} ${escapeHtml(k)}</li>`)
      .join('')
    : '';

  return `
    <h1>Overview</h1>
    <p class="lead">Operator view — real domains and delivery counters from the ad server.</p>
    ${data.softLaunch ? `
    <h2>Soft-launch readiness ${data.softLaunch.ready ? '(ready)' : '(not ready)'}</h2>
    <ul class="muted">${soft}</ul>
    <p class="muted">Eligible ${data.softLaunch.counts.eligibleSites ?? 0} · rotation ${data.softLaunch.counts.rotationAds ?? 0} · seed sites ${data.softLaunch.counts.seedSites ?? 0}</p>
    ` : ''}
    <div class="grid">
      <div class="stat"><span class="muted">Sites</span><strong>${data.counts.sites}</strong></div>
      <div class="stat"><span class="muted">Opted in</span><strong>${data.counts.optedIn}</strong></div>
      <div class="stat"><span class="muted">Ads</span><strong>${data.counts.ads}</strong></div>
      <div class="stat"><span class="muted">Active licenses</span><strong>${data.counts.activeLicenses}</strong></div>
      <div class="stat"><span class="muted">Serves</span><strong>${data.counts.serves}</strong></div>
      <div class="stat"><span class="muted">Clicks</span><strong>${data.counts.clicks}</strong></div>
      <div class="stat"><span class="muted">CTR %</span><strong>${data.counts.ctr}</strong></div>
    </div>
    <h2>Network status</h2>
    <div class="grid">${network || '<p class="muted">No entitlement rows yet.</p>'}</div>
    <h2>Top ads by serves</h2>
    <table>
      <thead><tr><th>Ad / publisher domain</th><th>Status</th><th>Serves</th><th>Clicks</th></tr></thead>
      <tbody>${topAds || '<tr><td colspan="4" class="muted">No delivery yet</td></tr>'}</tbody>
    </table>
    <h2>Recently seen sites</h2>
    <table>
      <thead><tr><th>Domain</th><th>Network</th><th>Opt-in</th><th>Last seen</th></tr></thead>
      <tbody>${recent || '<tr><td colspan="4" class="muted">No sites</td></tr>'}</tbody>
    </table>
    <h2>Runtime</h2>
    <p class="muted">Rotation items: ${data.rotation.items ?? 0} · sites: ${data.rotation.sites ?? 0} · queue: ${data.events.size ?? 0} · dropped: ${data.events.dropped ?? 0}</p>
    ${data.rotation.lastError ? `<div class="notice">${escapeHtml(String(data.rotation.lastError))}</div>` : ''}
  `;
}

type Site = {
  id: string;
  siteDomain: string;
  siteUrl: string;
  status: string;
  optedIn: boolean;
  networkStatus: string | null;
  networkAccessUntil: string | null;
  lastSeenAt?: string | null;
  pluginVersion?: string | null;
  servedCount?: number;
  clickCount?: number;
  activeAds?: number;
  _count?: { ads: number; activations: number };
};

export function sitesBody(sites: Site[], filters: { q?: string; networkStatus?: string; optedIn?: string }): string {
  const rows = sites.map((s) => `
    <tr>
      <td>
        <a href="/sites/${encodeURIComponent(s.id)}"><strong class="mono">${escapeHtml(s.siteDomain)}</strong></a>
        <div class="muted">${escapeHtml(s.siteUrl)}</div>
      </td>
      <td>${escapeHtml(s.status)}</td>
      <td>${escapeHtml(s.networkStatus ?? 'NONE')}</td>
      <td>${s.optedIn ? 'yes' : 'no'}</td>
      <td>${s.servedCount ?? 0} / ${s.clickCount ?? 0}</td>
      <td class="mono">${fmt(s.networkAccessUntil)}</td>
      <td class="actions">
        <a class="btn" href="/sites/${encodeURIComponent(s.id)}">Open</a>
        <form method="post" action="/sites/${encodeURIComponent(s.id)}/extend-trial"><button type="submit">+30d</button></form>
        <form method="post" action="/sites/${encodeURIComponent(s.id)}/grant-pro"><button type="submit">Pro</button></form>
        <form method="post" action="/sites/${encodeURIComponent(s.id)}/suspend"><button type="submit">Suspend</button></form>
        <form method="post" action="/sites/${encodeURIComponent(s.id)}/revoke"><button class="danger" type="submit">Revoke</button></form>
      </td>
    </tr>`).join('');

  return `
    <h1>Sites</h1>
    <p class="lead">Real publisher domains. Search and filter before mutating entitlement.</p>
    <form method="get" action="/sites" class="actions" style="margin-bottom:1rem">
      <input name="q" value="${escapeHtml(filters.q || '')}" placeholder="domain, URL, name, id">
      <select name="networkStatus">
        ${['ALL', 'TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'NONE'].map((v) =>
          `<option value="${v}" ${(filters.networkStatus || 'ALL') === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <select name="optedIn">
        <option value="" ${!filters.optedIn ? 'selected' : ''}>Opt-in any</option>
        <option value="1" ${filters.optedIn === '1' ? 'selected' : ''}>Opted in</option>
        <option value="0" ${filters.optedIn === '0' ? 'selected' : ''}>Opted out</option>
      </select>
      <button class="primary" type="submit">Filter</button>
    </form>
    <table>
      <thead><tr><th>Site</th><th>Status</th><th>Network</th><th>Opt-in</th><th>Serve/Click</th><th>Access until</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">No sites</td></tr>'}</tbody>
    </table>`;
}

export function siteDetailBody(site: {
  id: string;
  siteDomain: string;
  siteUrl: string;
  siteName: string | null;
  status: string;
  optedIn: boolean;
  pluginVersion: string | null;
  lastSeenAt: string | null;
  networkStatus: string | null;
  networkTrialStartedAt: string | null;
  networkAccessUntil: string | null;
  ads: Array<{ id: string; title: string; status: string; servedCount: number; clickCount: number; targetUrl: string }>;
  activations: Array<{
    license: { licenseKey: string; status: string; customerEmail: string | null; expiresAt: string | null };
  }>;
}): string {
  const ads = site.ads.map((a) => `
    <tr>
      <td>${escapeHtml(a.title)}</td>
      <td>${escapeHtml(a.status)}</td>
      <td>${a.servedCount} / ${a.clickCount}</td>
      <td class="mono">${escapeHtml(a.targetUrl)}</td>
    </tr>`).join('');
  const licenses = site.activations.map((a) => `
    <tr>
      <td class="mono">${escapeHtml(a.license.licenseKey)}</td>
      <td>${escapeHtml(a.license.status)}</td>
      <td>${escapeHtml(a.license.customerEmail ?? '—')}</td>
      <td class="mono">${fmt(a.license.expiresAt)}</td>
    </tr>`).join('');

  return `
    <p><a href="/sites">← Sites</a></p>
    <h1 class="mono">${escapeHtml(site.siteDomain)}</h1>
    <p class="lead">${escapeHtml(site.siteUrl)}${site.siteName ? ` · ${escapeHtml(site.siteName)}` : ''}</p>
    <div class="grid">
      <div class="stat"><span class="muted">Status</span><strong>${escapeHtml(site.status)}</strong></div>
      <div class="stat"><span class="muted">Network</span><strong>${escapeHtml(site.networkStatus ?? 'NONE')}</strong></div>
      <div class="stat"><span class="muted">Opt-in</span><strong>${site.optedIn ? 'yes' : 'no'}</strong></div>
      <div class="stat"><span class="muted">Plugin</span><strong>${escapeHtml(site.pluginVersion ?? '—')}</strong></div>
      <div class="stat"><span class="muted">Last seen</span><strong class="mono" style="font-size:0.9rem">${fmt(site.lastSeenAt)}</strong></div>
      <div class="stat"><span class="muted">Access until</span><strong class="mono" style="font-size:0.9rem">${fmt(site.networkAccessUntil)}</strong></div>
    </div>
    <div class="actions" style="margin:1rem 0">
      <form method="post" action="/sites/${encodeURIComponent(site.id)}/extend-trial"><button type="submit">+30d trial</button></form>
      <form method="post" action="/sites/${encodeURIComponent(site.id)}/grant-pro"><button type="submit">Grant Pro 30d</button></form>
      <form method="post" action="/sites/${encodeURIComponent(site.id)}/opt-out"><button type="submit">Opt out</button></form>
      <form method="post" action="/sites/${encodeURIComponent(site.id)}/suspend"><button type="submit">Suspend</button></form>
      <form method="post" action="/sites/${encodeURIComponent(site.id)}/revoke"><button class="danger" type="submit">Revoke</button></form>
      <form method="post" action="/sites/${encodeURIComponent(site.id)}/reset-activation"><button type="submit">Reset activation</button></form>
    </div>
    <h2>Ads</h2>
    <table>
      <thead><tr><th>Title</th><th>Status</th><th>Serve/Click</th><th>Target</th></tr></thead>
      <tbody>${ads || '<tr><td colspan="4" class="muted">No ads</td></tr>'}</tbody>
    </table>
    <h2>License activations</h2>
    <table>
      <thead><tr><th>Key</th><th>Status</th><th>Email</th><th>Expires</th></tr></thead>
      <tbody>${licenses || '<tr><td colspan="4" class="muted">No active license bindings</td></tr>'}</tbody>
    </table>`;
}

type Ad = {
  id: string;
  title: string;
  status: string;
  weight: number;
  servedCount: number;
  clickCount: number;
  targetUrl?: string;
  site?: { siteDomain?: string; siteUrl?: string; networkStatus?: string | null };
};

export function adsBody(ads: Ad[], filters: { q?: string; status?: string }): string {
  const rows = ads.map((a) => `
    <tr>
      <td>${escapeHtml(a.title)}
        <div class="muted mono">${escapeHtml(a.site?.siteDomain ?? a.id)}</div>
        <div class="muted mono">${escapeHtml(a.targetUrl ?? '')}</div>
      </td>
      <td>${escapeHtml(a.status)}<div class="muted">${escapeHtml(a.site?.networkStatus ?? '')}</div></td>
      <td>${a.weight}</td>
      <td>${a.servedCount} / ${a.clickCount}</td>
      <td class="actions">
        <form method="post" action="/ads/${encodeURIComponent(a.id)}/status"><input type="hidden" name="status" value="ACTIVE"><button type="submit">Active</button></form>
        <form method="post" action="/ads/${encodeURIComponent(a.id)}/status"><input type="hidden" name="status" value="PAUSED"><button type="submit">Pause</button></form>
        <form method="post" action="/ads/${encodeURIComponent(a.id)}/status"><input type="hidden" name="status" value="BLOCKED"><button class="danger" type="submit">Block</button></form>
      </td>
    </tr>`).join('');

  return `
    <h1>Ads</h1>
    <p class="lead">Publisher domains and targets are visible to operators (not anonymized).</p>
    <form method="get" action="/ads" class="actions" style="margin-bottom:1rem">
      <input name="q" value="${escapeHtml(filters.q || '')}" placeholder="title, domain, target, id">
      <select name="status">
        ${['ALL', 'ACTIVE', 'PAUSED', 'BLOCKED', 'PENDING', 'REJECTED'].map((v) =>
          `<option value="${v}" ${(filters.status || 'ALL') === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <button class="primary" type="submit">Filter</button>
    </form>
    <table>
      <thead><tr><th>Creative / publisher</th><th>Status</th><th>Weight</th><th>Serve/Click</th><th>Moderation</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">No ads</td></tr>'}</tbody>
    </table>`;
}

type License = {
  licenseKey: string;
  status: string;
  customerEmail: string | null;
  expiresAt: string | null;
  stripeSubscriptionId: string | null;
  activations: Array<{ domainSnapshot: string; siteId: string }>;
};

export function licensesBody(licenses: License[], filters: { q?: string }): string {
  const rows = licenses.map((l) => `
    <tr>
      <td class="mono">${escapeHtml(l.licenseKey)}</td>
      <td>${escapeHtml(l.status)}</td>
      <td>${escapeHtml(l.customerEmail ?? '—')}</td>
      <td>${fmt(l.expiresAt)}</td>
      <td class="mono">${escapeHtml(l.stripeSubscriptionId ?? '—')}</td>
      <td>${l.activations.map((a) => `<a href="/sites/${encodeURIComponent(a.siteId)}">${escapeHtml(a.domainSnapshot)}</a>`).join(', ') || '—'}</td>
    </tr>`).join('');

  return `
    <h1>Licenses</h1>
    <p class="lead">Commercial keys with real activation domains.</p>
    <form method="get" action="/licenses" class="actions" style="margin-bottom:1rem">
      <input name="q" value="${escapeHtml(filters.q || '')}" placeholder="key, email, stripe id">
      <button class="primary" type="submit">Search</button>
    </form>
    <table>
      <thead><tr><th>Key</th><th>Status</th><th>Email</th><th>Expires</th><th>Stripe sub</th><th>Sites</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">No licenses</td></tr>'}</tbody>
    </table>`;
}

export function systemBody(metrics: {
  rotation: Record<string, unknown>;
  events: Record<string, unknown>;
  rateLimits: Record<string, unknown>;
}): string {
  return `
    <h1>System</h1>
    <p class="lead">Cache and queue controls on the ad server.</p>
    <div class="actions" style="margin-bottom:1rem">
      <form method="post" action="/system/rebuild-cache"><button class="primary" type="submit">Rebuild rotation cache</button></form>
      <form method="post" action="/system/flush-events"><button type="submit">Flush event queue</button></form>
      <form method="post" action="/system/soft-launch-seed"><button type="submit">Seed soft-launch inventory</button></form>
    </div>
    <h2>Metrics snapshot</h2>
    <pre class="mono" style="white-space:pre-wrap;background:var(--panel);border:1px solid var(--line);padding:1rem">${escapeHtml(JSON.stringify(metrics, null, 2))}</pre>`;
}

export function communityAdminBody(data: {
  posts: Array<{
    id: string;
    title: string;
    slug: string;
    isPinned: boolean;
    isLocked: boolean;
    author: { displayName: string };
    _count: { comments: number };
  }>;
  members: Array<{
    id: string;
    displayName: string;
    canPost: boolean;
    site: { siteDomain: string };
  }>;
}): string {
  const posts = data.posts.map((p) => `
    <tr>
      <td>${escapeHtml(p.title)}<div class="muted">${escapeHtml(p.author.displayName)} · ${p._count.comments} comments</div></td>
      <td>${p.isPinned ? 'pinned' : '—'} / ${p.isLocked ? 'locked' : 'open'}</td>
      <td class="actions">
        <form method="post" action="/community/posts/${encodeURIComponent(p.id)}/moderate">
          <input type="hidden" name="isPinned" value="${p.isPinned ? '0' : '1'}">
          <button type="submit">${p.isPinned ? 'Unpin' : 'Pin'}</button>
        </form>
        <form method="post" action="/community/posts/${encodeURIComponent(p.id)}/moderate">
          <input type="hidden" name="isLocked" value="${p.isLocked ? '0' : '1'}">
          <button type="submit">${p.isLocked ? 'Unlock' : 'Lock'}</button>
        </form>
        <form method="post" action="/community/posts/${encodeURIComponent(p.id)}/delete"><button class="danger" type="submit">Delete</button></form>
      </td>
    </tr>`).join('');
  const members = data.members.map((m) => `
    <tr>
      <td>${escapeHtml(m.displayName)}<div class="muted mono">${escapeHtml(m.site.siteDomain)}</div></td>
      <td>${m.canPost ? 'can post' : 'muted'}</td>
      <td class="actions">
        <form method="post" action="/community/members/${encodeURIComponent(m.id)}/can-post">
          <input type="hidden" name="canPost" value="${m.canPost ? '0' : '1'}">
          <button type="submit">${m.canPost ? 'Disable posting' : 'Allow posting'}</button>
        </form>
      </td>
    </tr>`).join('');

  return `
    <h1>Community</h1>
    <p class="lead">Moderate forum posts and member posting rights.</p>
    <div class="actions" style="margin-bottom:1rem">
      <form method="post" action="/community/seed"><button type="submit">Seed pinned posts if empty</button></form>
    </div>
    <h2>Posts</h2>
    <table>
      <thead><tr><th>Post</th><th>Flags</th><th>Actions</th></tr></thead>
      <tbody>${posts || '<tr><td colspan="3" class="muted">No posts</td></tr>'}</tbody>
    </table>
    <h2>Members</h2>
    <table>
      <thead><tr><th>Member</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${members || '<tr><td colspan="3" class="muted">No members</td></tr>'}</tbody>
    </table>`;
}
