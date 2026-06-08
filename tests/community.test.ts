import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc, eq } = vi.hoisted(() => {
  const p = {
    communityAd: { findUnique: vi.fn() },
  };
  const rc = {
    getSnapshot: vi.fn(),
    nextAd: vi.fn(),
    getAd: vi.fn(),
    status: vi.fn().mockReturnValue({
      version: 0, items: 0, sites: 0, lastBuiltAt: null,
      lastBuildMs: null, lastError: null, ttlMs: 30000, cursor: 0, loading: false,
    }),
  };
  const eq = {
    push: vi.fn().mockReturnValue(true),
    status: vi.fn().mockReturnValue({ size: 0, flushing: false, dropped: 0 }),
  };
  return { p, rc, eq };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));
vi.mock('../src/services/eventQueue.js', () => ({ eventQueue: eq }));

import { createApp } from '../src/app.js';
import { signEventToken } from '../src/services/serveService.js';

const app = createApp();
const ADMIN = 'Bearer test-admin-token-static-value-for-ci';

const rotationAd = {
  adId: 'ad_community_test',
  siteId: 'site_other',
  siteDomain: 'other.com',
  title: 'Community Test Ad',
  imageUrl: 'https://other.com/img.jpg',
  targetUrl: 'https://other.com/landing',
  weight: 1,
};

const activeSiteSnapshot = {
  ads: [rotationAd],
  siteByDomain: new Map([
    ['example.com', { id: 'site_src', siteDomain: 'example.com', optedIn: true, status: 'ACTIVE' }],
  ]),
  refreshedAt: Date.now(),
  cursor: 0,
  version: 1,
};

const emptySnapshot = { ads: [], siteByDomain: new Map(), refreshedAt: Date.now(), cursor: 0, version: 0 };

describe('GET /v1/community/serve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rc.getSnapshot.mockResolvedValue(emptySnapshot);
    rc.nextAd.mockReturnValue(null);
    eq.push.mockReturnValue(true);
  });

  it('returns 204 when the requesting site is not in the rotation cache', async () => {
    const res = await request(app).get('/v1/community/serve?siteUrl=https://example.com');
    expect(res.status).toBe(204);
  });

  it('returns 204 when nextAd returns null (no eligible ads)', async () => {
    rc.getSnapshot.mockResolvedValue(activeSiteSnapshot);
    rc.nextAd.mockReturnValue(null);
    const res = await request(app).get('/v1/community/serve?siteUrl=https://example.com');
    expect(res.status).toBe(204);
  });

  it('returns 200 with ad data and tracking URLs when an ad is available', async () => {
    rc.getSnapshot.mockResolvedValue(activeSiteSnapshot);
    rc.nextAd.mockReturnValue(rotationAd);

    const res = await request(app).get('/v1/community/serve?siteUrl=https://example.com');

    expect(res.status).toBe(200);
    expect(res.body.adId).toBe(rotationAd.adId);
    expect(res.body.title).toBe(rotationAd.title);
    expect(res.body.imageUrl).toBe(rotationAd.imageUrl);
    expect(res.body.targetUrl).toBe(rotationAd.targetUrl);
    expect(res.body.impressionUrl).toMatch(/\/community\/events\/impression\?token=/);
    expect(res.body.clickUrl).toMatch(/\/community\/events\/click\?token=/);
    expect(res.body.network.servedBy).toBe('community');
    expect(res.body.network.algorithm).toBe('cached-round-robin');
  });

  it('returns 200 without tracking URLs when tracking=0', async () => {
    rc.getSnapshot.mockResolvedValue(activeSiteSnapshot);
    rc.nextAd.mockReturnValue(rotationAd);

    const res = await request(app).get('/v1/community/serve?siteUrl=https://example.com&tracking=0');

    expect(res.status).toBe(200);
    expect(res.body.impressionUrl).toBeUndefined();
    expect(res.body.clickUrl).toBeUndefined();
  });

  it('returns 400 for an invalid siteUrl', async () => {
    const res = await request(app).get('/v1/community/serve?siteUrl=not-a-url');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 204 when the requesting site is not opted in', async () => {
    rc.getSnapshot.mockResolvedValue({
      ...activeSiteSnapshot,
      siteByDomain: new Map([
        ['example.com', { id: 'site_src', siteDomain: 'example.com', optedIn: false, status: 'ACTIVE' }],
      ]),
    });

    const res = await request(app).get('/v1/community/serve?siteUrl=https://example.com');
    expect(res.status).toBe(204);
  });
});

describe('POST /v1/community/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.push.mockReturnValue(true);
    eq.status.mockReturnValue({ size: 1, flushing: false, dropped: 0 });
  });

  it('returns 202 and queues the event for a valid token', async () => {
    const token = signEventToken({ adId: 'ad1', sourceSiteId: 'site1', targetSiteId: 'site2', requestId: 'req1' });

    const res = await request(app).post('/v1/community/events').send({ token, type: 'IMPRESSION' });

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(eq.push).toHaveBeenCalledOnce();
  });

  it('returns 400 for a tampered or invalid token', async () => {
    const res = await request(app).post('/v1/community/events').send({
      token: 'invalid.tampered_token_here',
      type: 'IMPRESSION',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 400 when type field is missing', async () => {
    const token = signEventToken({ adId: 'ad1', sourceSiteId: 's1', targetSiteId: 's2' });
    const res = await request(app).post('/v1/community/events').send({ token });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/community/events/impression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.push.mockReturnValue(true);
  });

  it('returns 200 image/gif for a valid token', async () => {
    const token = signEventToken({ adId: 'ad1', sourceSiteId: 's1', targetSiteId: 's2' });

    const res = await request(app)
      .get(`/v1/community/events/impression?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/gif');
    expect(eq.push).toHaveBeenCalledOnce();
  });

  it('returns 400 JSON error for an invalid token (not a GIF)', async () => {
    const res = await request(app).get('/v1/community/events/impression?token=invalid.badtoken');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('GET /v1/community/events/click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.push.mockReturnValue(true);
    p.communityAd.findUnique.mockResolvedValue(null);
    rc.getAd.mockReturnValue(null);
  });

  it('redirects 302 to targetUrl when ad is found in cache', async () => {
    const token = signEventToken({
      adId: rotationAd.adId, sourceSiteId: 'site_src', targetSiteId: 'site_other',
    });
    rc.getAd.mockReturnValue(rotationAd);

    const res = await request(app)
      .get(`/v1/community/events/click?token=${encodeURIComponent(token)}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(rotationAd.targetUrl);
  });

  it('redirects 302 to targetUrl when ad is found in DB but not cache', async () => {
    const token = signEventToken({
      adId: 'ad_db_only', sourceSiteId: 's1', targetSiteId: 's2',
    });
    rc.getAd.mockReturnValue(null);
    p.communityAd.findUnique.mockResolvedValue({ targetUrl: 'https://db.example.com/page' });

    const res = await request(app)
      .get(`/v1/community/events/click?token=${encodeURIComponent(token)}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://db.example.com/page');
  });

  it('returns 404 when ad is not found in cache or database', async () => {
    const token = signEventToken({ adId: 'deleted_ad_id', sourceSiteId: 's1', targetSiteId: 's2' });
    rc.getAd.mockReturnValue(null);
    p.communityAd.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/v1/community/events/click?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an invalid token', async () => {
    const res = await request(app).get('/v1/community/events/click?token=invalid.badtoken');
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/community/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without admin token', async () => {
    const res = await request(app).get('/v1/community/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with rotation and event status for a valid admin token', async () => {
    const res = await request(app).get('/v1/community/status').set('authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rotation).toBeDefined();
    expect(res.body.events).toBeDefined();
  });
});
