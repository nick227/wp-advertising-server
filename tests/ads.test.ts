import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc } = vi.hoisted(() => {
  const p = {
    blockedDomain: { findUnique: vi.fn() },
    communitySite: { findUnique: vi.fn() },
    communityAd: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const rc = { invalidate: vi.fn().mockResolvedValue(undefined) };
  return { p, rc };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));

import { createApp } from '../src/app.js';

const app = createApp();

const mockSite = {
  id: 'site_adtest',
  siteUrl: 'https://other.com',
  siteDomain: 'other.com',
  status: 'ACTIVE',
  optedIn: true,
  publicKey: 'pub_adtest_apikey_1234567890abcdef',
  pluginVersion: '8.0.0',
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAd = {
  id: 'ad_test001',
  siteId: mockSite.id,
  title: 'Test Ad',
  imageUrl: 'https://other.com/img.jpg',
  targetUrl: 'https://other.com/',
  status: 'ACTIVE',
  weight: 1,
  servedCount: 0,
  clickCount: 0,
  updatedAt: new Date(),
};

const validPayload = {
  siteId: mockSite.id,
  apiKey: mockSite.publicKey,
  title: 'Test Ad',
  imageUrl: 'https://other.com/img.jpg',
  targetUrl: 'https://other.com/',
};

describe('POST /v1/sites/ad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.blockedDomain.findUnique.mockResolvedValue(null);
    p.communityAd.findFirst.mockResolvedValue(null);
  });

  it('creates a new ad when none exists for the site', async () => {
    p.communitySite.findUnique.mockResolvedValue(mockSite);
    p.communityAd.create.mockResolvedValue(mockAd);

    const res = await request(app).post('/v1/sites/ad').send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockAd.id);
    expect(res.body.title).toBe('Test Ad');
    expect(rc.invalidate).toHaveBeenCalledOnce();
  });

  it('updates the existing ad when one already exists for the site', async () => {
    p.communitySite.findUnique.mockResolvedValue(mockSite);
    p.communityAd.findFirst.mockResolvedValue(mockAd);
    p.communityAd.update.mockResolvedValue({ ...mockAd, title: 'Updated Ad' });

    const res = await request(app).post('/v1/sites/ad').send({ ...validPayload, title: 'Updated Ad' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Ad');
    expect(rc.invalidate).toHaveBeenCalledOnce();
  });

  it('returns 403 when apiKey is wrong', async () => {
    p.communitySite.findUnique.mockResolvedValue(mockSite);

    const res = await request(app).post('/v1/sites/ad').send({ ...validPayload, apiKey: 'wrong-apikey-abcdefgh' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when the image URL domain is blocked', async () => {
    p.communitySite.findUnique.mockResolvedValue(mockSite);
    p.blockedDomain.findUnique.mockResolvedValue({ id: 'b1', domain: 'blocked.com', reason: 'spam', createdAt: new Date() });

    const res = await request(app).post('/v1/sites/ad').send({
      ...validPayload,
      imageUrl: 'https://blocked.com/img.jpg',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 when required ad fields are missing', async () => {
    const res = await request(app).post('/v1/sites/ad').send({
      siteId: mockSite.id,
      apiKey: mockSite.publicKey,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
