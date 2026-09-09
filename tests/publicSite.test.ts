import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    billingConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    communitySite: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    communityAd: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    communityPost: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    communityUser: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../src/services/rotationCache.js', () => ({
  rotationCache: {
    status: vi.fn().mockReturnValue({ version: 0, items: 0, sites: 0, lastBuiltAt: null, lastBuildMs: null, lastError: null, ttlMs: 300000, cursor: 0, loading: false }),
    getSnapshot: vi.fn(),
    nextAd: vi.fn(),
    getAd: vi.fn(),
    invalidate: vi.fn(),
    rebuildNow: vi.fn(),
    warm: vi.fn(),
  },
}));

vi.mock('../src/services/eventQueue.js', () => ({
  eventQueue: {
    status: vi.fn().mockReturnValue({ size: 0, flushing: false, dropped: 0 }),
    push: vi.fn(),
    flush: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';

const app = createApp();

const livePages = [
  '/',
  '/checkout',
  '/checkout/success',
  '/community',
  '/community/login',
  '/community/register',
  '/privacy',
  '/terms',
  '/community-standards',
  '/refunds',
  '/contact',
  '/status',
];

const retiredPages = [
  '/plugin',
  '/pricing',
  '/help',
  '/help/licensing',
  '/investors',
];

describe('public product site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(livePages)('GET %s returns HTML 200 with WP Advertising branding', async (path) => {
    const res = await request(app).get(path).set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('WP');
    expect(res.text).toContain('Advertising');
    expect(res.text).toContain('/assets/site.css');
  });

  it.each(retiredPages)('GET %s redirects to homepage', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('homepage is plugin-first with Free and Premium', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('What the plugin does');
    expect(res.text).toContain('Free');
    expect(res.text).toContain('Premium');
    expect(res.text).toContain('Download');
    expect(res.text).not.toContain('Start 30-Day Trial');
    expect(res.text).not.toContain('href="/pricing"');
    expect(res.text).not.toContain('href="/investors"');
  });

  it('nav is Home, Community, and Download', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('href="/"');
    expect(res.text).toContain('href="/community"');
    expect(res.text).toContain('href="/plugin/download"');
    expect(res.text).not.toContain('href="/help"');
  });

  it('serves site.css', async () => {
    const res = await request(app).get('/assets/site.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/css/);
    expect(res.text).toContain('--accent');
  });

  it('POST /checkout/session returns 503 until Stripe is connected', async () => {
    const res = await request(app).post('/checkout/session').send({ plan: 'monthly' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CHECKOUT_NOT_CONFIGURED');
  });

  it('keeps /v1/health available beside the public site', async () => {
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('plugin download uses the generated release when no external URL is set', async () => {
    const res = await request(app).get('/plugin/download');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/assets/wp-advertising.zip');
  });
});
