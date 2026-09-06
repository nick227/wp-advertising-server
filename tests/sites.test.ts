import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc } = vi.hoisted(() => {
  const p = {
    blockedDomain: { findUnique: vi.fn() },
    communitySite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const rc = { invalidate: vi.fn().mockResolvedValue(undefined) };
  return { p, rc };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));

import { createApp } from '../src/app.js';

const app = createApp();

const mockSite = {
  id: 'site_abc123test',
  siteUrl: 'https://example.com',
  siteDomain: 'example.com',
  siteName: 'Test Site',
  status: 'ACTIVE',
  optedIn: false,
  publicKey: 'pub_test_apikey_12345678901234567890',
  pluginVersion: '8.0.0',
  lastSeenAt: new Date(),
  networkStatus: 'TRIAL',
  networkTrialStartedAt: new Date(),
  networkAccessUntil: new Date(Date.now() + 86400000),
  category: null,
  publicIdentityOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('POST /v1/sites/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.blockedDomain.findUnique.mockResolvedValue(null);
    p.communitySite.findFirst.mockResolvedValue(null);
  });

  it('creates a new site and returns 201 with apiKey — no publicKey or secret in response', async () => {
    p.communitySite.create.mockResolvedValue(mockSite);

    const res = await request(app)
      .post('/v1/sites/register')
      .send({ siteUrl: 'https://example.com', siteName: 'Test Site' });

    expect(res.status).toBe(201);
    expect(res.body.siteId).toBe(mockSite.id);
    expect(res.body.apiKey).toBe(mockSite.publicKey);
    expect(res.body.alreadyRegistered).toBe(false);
    expect(res.body).not.toHaveProperty('publicKey');
    expect(res.body).not.toHaveProperty('secret');
    expect(res.body).not.toHaveProperty('secretHash');
  });

  it('returns 201 with alreadyRegistered:true for an existing site', async () => {
    p.communitySite.findFirst.mockResolvedValue(mockSite);
    p.communitySite.update.mockResolvedValue(mockSite);

    const res = await request(app).post('/v1/sites/register').send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body.alreadyRegistered).toBe(true);
    expect(res.body.apiKey).toBe(mockSite.publicKey);
    expect(res.body).not.toHaveProperty('secret');
  });

  it('returns 403 when the domain is blocked', async () => {
    p.blockedDomain.findUnique.mockResolvedValue({ id: 'b1', domain: 'example.com', reason: 'spam', createdAt: new Date() });

    const res = await request(app).post('/v1/sites/register').send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for an invalid siteUrl', async () => {
    const res = await request(app).post('/v1/sites/register').send({ siteUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when siteUrl is missing entirely', async () => {
    const res = await request(app).post('/v1/sites/register').send({ siteName: 'No URL Site' });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/sites/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findUnique.mockResolvedValue(null);
  });

  it('returns 200 with site status for valid credentials', async () => {
    p.communitySite.findUnique.mockResolvedValue(mockSite);
    p.communitySite.update.mockResolvedValue({
      id: mockSite.id, status: 'ACTIVE', optedIn: false, lastSeenAt: new Date(),
    });

    const res = await request(app).post('/v1/sites/heartbeat').send({
      siteId: mockSite.id,
      apiKey: mockSite.publicKey,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockSite.id);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('returns 403 when apiKey does not match', async () => {
    p.communitySite.findUnique.mockResolvedValue(mockSite);

    const res = await request(app).post('/v1/sites/heartbeat').send({
      siteId: mockSite.id,
      apiKey: 'wrong-apikey-that-does-not-match',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when site does not exist', async () => {
    p.communitySite.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/v1/sites/heartbeat').send({
      siteId: 'nonexistent_site_id',
      apiKey: 'any-valid-length-key123456',
    });

    expect(res.status).toBe(404);
  });
});

describe('POST /v1/sites/opt-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findUnique.mockResolvedValue(mockSite);
    p.communitySite.update.mockResolvedValue({ id: mockSite.id, status: 'ACTIVE', optedIn: true, updatedAt: new Date() });
    rc.invalidate.mockResolvedValue(undefined);
  });

  it('returns 200 and sets optedIn to true', async () => {
    const res = await request(app).post('/v1/sites/opt-in').send({
      siteId: mockSite.id,
      apiKey: mockSite.publicKey,
    });

    expect(res.status).toBe(200);
    expect(res.body.optedIn).toBe(true);
    expect(rc.invalidate).toHaveBeenCalledOnce();
  });

  it('returns 403 when the site has no active Trial or Pro entitlement', async () => {
    p.communitySite.findUnique.mockResolvedValue({
      ...mockSite,
      networkStatus: null,
      networkAccessUntil: null,
      networkTrialStartedAt: null,
    });

    const res = await request(app).post('/v1/sites/opt-in').send({
      siteId: mockSite.id,
      apiKey: mockSite.publicKey,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /v1/sites/opt-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communitySite.findUnique.mockResolvedValue(mockSite);
    p.communitySite.update.mockResolvedValue({ id: mockSite.id, status: 'ACTIVE', optedIn: false, updatedAt: new Date() });
    rc.invalidate.mockResolvedValue(undefined);
  });

  it('returns 200 and sets optedIn to false', async () => {
    const res = await request(app).post('/v1/sites/opt-out').send({
      siteId: mockSite.id,
      apiKey: mockSite.publicKey,
    });

    expect(res.status).toBe(200);
    expect(res.body.optedIn).toBe(false);
    expect(rc.invalidate).toHaveBeenCalledOnce();
  });
});
