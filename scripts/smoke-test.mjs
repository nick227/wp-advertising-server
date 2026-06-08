#!/usr/bin/env node
const baseUrl = (process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:4100/v1').replace(/\/+$/, '');
const adminToken = process.env.ADMIN_TOKEN || 'change-me';
const siteUrl = process.env.SMOKE_SITE_URL || `https://smoke-${Date.now()}.example.com`;
const otherSiteUrl = process.env.SMOKE_OTHER_SITE_URL || `https://smoke-other-${Date.now()}.example.com`;

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-request-id': `smoke_${Date.now()}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { res, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request('/health');
assert(health.res.ok, `/health failed: ${health.res.status} ${JSON.stringify(health.body)}`);

const site = await request('/sites/register', {
  method: 'POST',
  body: JSON.stringify({ siteUrl, siteName: 'Smoke Test Site', pluginVersion: 'smoke' }),
});
assert(site.res.status === 201, `/sites/register failed: ${site.res.status} ${JSON.stringify(site.body)}`);
assert(site.body.apiKey, `/sites/register response missing apiKey`);
assert(!site.body.secret, `/sites/register response must not include secret`);

const other = await request('/sites/register', {
  method: 'POST',
  body: JSON.stringify({ siteUrl: otherSiteUrl, siteName: 'Smoke Test Other Site', pluginVersion: 'smoke' }),
});
assert(other.res.status === 201, `/sites/register other failed: ${other.res.status} ${JSON.stringify(other.body)}`);
assert(other.body.apiKey, `/sites/register other response missing apiKey`);

for (const registered of [site.body, other.body]) {
  const opt = await request('/sites/opt-in', {
    method: 'POST',
    body: JSON.stringify({ siteId: registered.siteId, apiKey: registered.apiKey }),
  });
  assert(opt.res.ok, `/sites/opt-in failed: ${opt.res.status} ${JSON.stringify(opt.body)}`);
}

const ad = await request('/sites/ad', {
  method: 'POST',
  body: JSON.stringify({
    siteId: other.body.siteId,
    apiKey: other.body.apiKey,
    title: 'Smoke Community Ad',
    imageUrl: 'https://example.com/smoke.jpg',
    targetUrl: 'https://example.com/',
  }),
});
assert(ad.res.ok, `/sites/ad failed: ${ad.res.status} ${JSON.stringify(ad.body)}`);

const rebuild = await request('/admin/cache/rebuild', {
  method: 'POST',
  headers: { authorization: `Bearer ${adminToken}` },
});
assert(rebuild.res.ok || rebuild.res.status === 401 || rebuild.res.status === 503, `/admin/cache/rebuild unexpected: ${rebuild.res.status}`);

const served = await request(`/community/serve?siteUrl=${encodeURIComponent(siteUrl)}&tracking=0`);
assert(served.res.status === 200 || served.res.status === 204, `/community/serve unexpected: ${served.res.status} ${JSON.stringify(served.body)}`);
if (served.res.status === 200) {
  assert(served.body.adId && served.body.targetUrl, 'serve response is missing adId/targetUrl');
}

const adminMetricsNoToken = await request('/admin/metrics');
assert([200, 401, 503, 429].includes(adminMetricsNoToken.res.status), `/admin/metrics unexpected: ${adminMetricsNoToken.res.status}`);

console.log(JSON.stringify({ ok: true, baseUrl, servedStatus: served.res.status }, null, 2));
