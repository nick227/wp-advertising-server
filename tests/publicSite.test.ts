import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
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

const pages = [
  '/',
  '/plugin',
  '/pricing',
  '/checkout',
  '/checkout/success',
  '/community',
  '/help',
  '/help/licensing',
  '/investors',
  '/privacy',
  '/terms',
  '/community-standards',
  '/refunds',
  '/contact',
  '/status',
];

describe('public product site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(pages)('GET %s returns HTML 200 with WP Advertising branding', async (path) => {
    const res = await request(app).get(path).set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('WP');
    expect(res.text).toContain('Advertising');
    expect(res.text).toContain('/assets/site.css');
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
});
