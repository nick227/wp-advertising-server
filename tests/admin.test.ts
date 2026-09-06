import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc, eq } = vi.hoisted(() => {
  const p = {
    communitySite: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    communityAd: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    license: { findMany: vi.fn(), count: vi.fn() },
    licenseActivation: { updateMany: vi.fn() },
    communityPost: { count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
  };
  const rc = {
    status: vi.fn().mockReturnValue({
      version: 0, items: 0, sites: 0, lastBuiltAt: null,
      lastBuildMs: null, lastError: null, ttlMs: 30000, cursor: 0, loading: false,
    }),
    rebuildNow: vi.fn(),
    invalidate: vi.fn().mockResolvedValue(undefined),
  };
  const eq = {
    flush: vi.fn(),
    status: vi.fn().mockReturnValue({ size: 0, flushing: false, dropped: 0 }),
  };
  return { p, rc, eq };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));
vi.mock('../src/services/eventQueue.js', () => ({ eventQueue: eq }));

import { createApp } from '../src/app.js';

const app = createApp();
const ADMIN = { authorization: 'Bearer test-admin-token-static-value-for-ci' };

const site = {
  id: 'site_1',
  siteUrl: 'https://shop.example.com',
  siteDomain: 'shop.example.com',
  siteName: 'Shop',
  status: 'ACTIVE',
  optedIn: true,
  pluginVersion: '8.3.0',
  lastSeenAt: new Date(),
  networkStatus: 'TRIAL',
  networkTrialStartedAt: new Date(),
  networkAccessUntil: new Date(Date.now() + 86400000),
  updatedAt: new Date(),
  createdAt: new Date(),
};

describe('Admin auth guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['get', '/v1/admin/overview'],
    ['get', '/v1/admin/sites'],
    ['get', '/v1/admin/ads'],
    ['get', '/v1/admin/licenses'],
  ] as const)('%s %s returns 401 without admin token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.count.mockResolvedValue(3);
    p.communityAd.count.mockResolvedValue(2);
    p.license.count.mockResolvedValue(1);
    p.communitySite.groupBy.mockResolvedValue([{ networkStatus: 'TRIAL', _count: { _all: 2 } }]);
    p.communityAd.groupBy.mockResolvedValue([{ status: 'ACTIVE', _count: { _all: 2 } }]);
    p.communityAd.aggregate.mockResolvedValue({ _sum: { servedCount: 100, clickCount: 4 } });
    p.communityAd.findMany.mockResolvedValue([
      { id: 'a1', title: 'Ad', servedCount: 100, clickCount: 4, status: 'ACTIVE', site: { siteDomain: 'shop.example.com', siteUrl: 'https://shop.example.com' } },
    ]);
    p.communitySite.findMany.mockResolvedValue([
      { id: 'site_1', siteDomain: 'shop.example.com', networkStatus: 'TRIAL', optedIn: true, lastSeenAt: new Date() },
    ]);
    p.communityPost.count.mockResolvedValue(7);
    p.$queryRaw.mockResolvedValue([{ ok: 1 }]);
  });

  it('returns real delivery totals and top ads', async () => {
    const res = await request(app).get('/v1/admin/overview').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.counts.serves).toBe(100);
    expect(res.body.counts.clicks).toBe(4);
    expect(res.body.counts.ctr).toBe(4);
    expect(res.body.topAds[0].site.siteDomain).toBe('shop.example.com');
    expect(res.body.recentSites).toHaveLength(1);
    expect(res.body.softLaunch.checks.forumSeeded).toBe(true);
  });
});

describe('site list + detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists sites with serve totals', async () => {
    p.communitySite.findMany.mockResolvedValue([
      {
        ...site,
        ads: [
          { servedCount: 10, clickCount: 1, status: 'ACTIVE' },
          { servedCount: 5, clickCount: 0, status: 'PAUSED' },
        ],
        _count: { ads: 2, activations: 0 },
      },
    ]);
    const res = await request(app).get('/v1/admin/sites?q=shop').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.sites[0].servedCount).toBe(15);
    expect(res.body.sites[0].activeAds).toBe(1);
  });

  it('returns site detail with ads and licenses', async () => {
    p.communitySite.findUnique.mockResolvedValue({
      ...site,
      ads: [{ id: 'a1', title: 'House', status: 'ACTIVE', weight: 1, servedCount: 3, clickCount: 1, targetUrl: 'https://x.test', imageUrl: 'https://x.test/i.png', updatedAt: new Date() }],
      activations: [],
    });
    const res = await request(app).get('/v1/admin/sites/site_1').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.site.siteDomain).toBe('shop.example.com');
    expect(res.body.site.ads).toHaveLength(1);
  });
});

describe('mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findUnique.mockResolvedValue(site);
    p.communitySite.update.mockResolvedValue({ ...site, networkStatus: 'ACTIVE' });
  });

  it('grants Pro', async () => {
    const res = await request(app).post('/v1/admin/sites/site_1/grant-pro').set(ADMIN).send({ days: 30 });
    expect(res.status).toBe(200);
    expect(rc.invalidate).toHaveBeenCalled();
  });
});
