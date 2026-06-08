import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc, eq } = vi.hoisted(() => {
  const p = {
    communitySite: { findMany: vi.fn() },
    communityAd: { findMany: vi.fn() },
  };
  const rc = {
    status: vi.fn().mockReturnValue({
      version: 0, items: 0, sites: 0, lastBuiltAt: null,
      lastBuildMs: null, lastError: null, ttlMs: 30000, cursor: 0, loading: false,
    }),
    rebuildNow: vi.fn(),
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

describe('Admin auth guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['post', '/v1/admin/cache/rebuild'],
    ['get', '/v1/admin/metrics'],
    ['post', '/v1/admin/events/flush'],
    ['get', '/v1/admin/sites'],
    ['get', '/v1/admin/ads'],
  ] as const)('%s %s returns 401 without admin token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
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
    expect(res.body.ok).toBe(true);
    expect(res.body.rotation).toBeDefined();
    expect(rc.rebuildNow).toHaveBeenCalledOnce();
  });
});

describe('GET /v1/admin/metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with rotation, events, and rateLimits', async () => {
    const res = await request(app).get('/v1/admin/metrics').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rotation).toBeDefined();
    expect(res.body.events).toBeDefined();
    expect(res.body.rateLimits).toBeDefined();
  });
});

describe('POST /v1/admin/events/flush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.flush.mockResolvedValue(undefined);
    eq.status.mockReturnValue({ size: 0, flushing: false, dropped: 0 });
  });

  it('returns 200 and calls eventQueue.flush', async () => {
    const res = await request(app).post('/v1/admin/events/flush').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(eq.flush).toHaveBeenCalledOnce();
  });
});

describe('GET /v1/admin/sites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findMany.mockResolvedValue([]);
  });

  it('returns 200 with a sites array', async () => {
    p.communitySite.findMany.mockResolvedValue([
      { id: 's1', siteUrl: 'https://test.com', siteDomain: 'test.com', status: 'ACTIVE', optedIn: true, updatedAt: new Date() },
    ]);

    const res = await request(app).get('/v1/admin/sites').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.sites)).toBe(true);
    expect(res.body.sites).toHaveLength(1);
    expect(res.body.sites[0].id).toBe('s1');
  });

  it('returns 200 with an empty sites array when no sites exist', async () => {
    const res = await request(app).get('/v1/admin/sites').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.sites).toHaveLength(0);
  });
});

describe('GET /v1/admin/ads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communityAd.findMany.mockResolvedValue([]);
  });

  it('returns 200 with an ads array', async () => {
    p.communityAd.findMany.mockResolvedValue([
      { id: 'a1', siteId: 's1', title: 'Test Ad', status: 'ACTIVE', weight: 1, updatedAt: new Date() },
    ]);

    const res = await request(app).get('/v1/admin/ads').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.ads)).toBe(true);
    expect(res.body.ads).toHaveLength(1);
  });
});
