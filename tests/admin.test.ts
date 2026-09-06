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
    },
    license: { findMany: vi.fn(), count: vi.fn() },
    licenseActivation: { updateMany: vi.fn() },
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
  pluginVersion: '8.2.0',
  lastSeenAt: new Date(),
  networkStatus: 'TRIAL',
  networkTrialStartedAt: new Date(),
  networkAccessUntil: new Date(Date.now() + 86400000),
  updatedAt: new Date(),
};

describe('Admin auth guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['post', '/v1/admin/cache/rebuild'],
    ['get', '/v1/admin/metrics'],
    ['get', '/v1/admin/overview'],
    ['post', '/v1/admin/events/flush'],
    ['get', '/v1/admin/sites'],
    ['get', '/v1/admin/ads'],
    ['get', '/v1/admin/licenses'],
  ] as const)('%s %s returns 401 without admin token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
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
  });

  it('returns aggregate counts', async () => {
    const res = await request(app).get('/v1/admin/overview').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.counts.sites).toBe(3);
    expect(res.body.networkStatus.TRIAL).toBe(2);
  });
});

describe('POST /v1/admin/cache/rebuild', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rc.rebuildNow.mockResolvedValue({ version: 1, items: 2, sites: 2, lastBuiltAt: new Date().toISOString(), lastBuildMs: 14, lastError: null, ttlMs: 30000, cursor: 0, loading: false });
  });

  it('returns 200 and triggers cache rebuild', async () => {
    const res = await request(app).post('/v1/admin/cache/rebuild').set(ADMIN);
    expect(res.status).toBe(200);
    expect(rc.rebuildNow).toHaveBeenCalledOnce();
  });
});

describe('site entitlement actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findUnique.mockResolvedValue(site);
    p.communitySite.update.mockResolvedValue({ ...site, networkStatus: 'ACTIVE' });
  });

  it('grants Pro', async () => {
    const res = await request(app).post('/v1/admin/sites/site_1/grant-pro').set(ADMIN).send({ days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.site.networkStatus).toBe('ACTIVE');
    expect(rc.invalidate).toHaveBeenCalled();
  });

  it('suspends a site', async () => {
    p.communitySite.update.mockResolvedValue({ ...site, networkStatus: 'SUSPENDED', optedIn: false });
    const res = await request(app).post('/v1/admin/sites/site_1/suspend').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.site.networkStatus).toBe('SUSPENDED');
  });
});

describe('GET /v1/admin/sites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findMany.mockResolvedValue([site]);
  });

  it('returns entitlement fields', async () => {
    const res = await request(app).get('/v1/admin/sites').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.sites[0].networkStatus).toBe('TRIAL');
  });
});

describe('GET /v1/admin/ads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communityAd.findMany.mockResolvedValue([]);
  });

  it('returns 200 with ads array', async () => {
    const res = await request(app).get('/v1/admin/ads').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ads).toEqual([]);
  });
});

describe('GET /v1/admin/licenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.license.findMany.mockResolvedValue([]);
  });

  it('returns 200 with licenses array', async () => {
    const res = await request(app).get('/v1/admin/licenses').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.licenses).toEqual([]);
  });
});

describe('POST /v1/admin/events/flush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.flush.mockResolvedValue(undefined);
  });

  it('flushes events', async () => {
    const res = await request(app).post('/v1/admin/events/flush').set(ADMIN);
    expect(res.status).toBe(200);
    expect(eq.flush).toHaveBeenCalledOnce();
  });
});

describe('GET /v1/admin/metrics', () => {
  it('returns metrics payload', async () => {
    const res = await request(app).get('/v1/admin/metrics').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.rotation).toBeDefined();
  });
});
