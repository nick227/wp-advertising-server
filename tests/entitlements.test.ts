import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc } = vi.hoisted(() => {
  const p = {
    communitySite: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const rc = { invalidate: vi.fn().mockResolvedValue(undefined) };
  return { p, rc };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));

import { createApp } from '../src/app.js';
import { isSiteNetworkEligible, rulesForSite, FREE_RULES, PRO_RULES } from '../src/services/entitlementService.js';

const app = createApp();

const baseSite = {
  id: 'site_entitlement',
  siteUrl: 'https://shop.example.com',
  siteDomain: 'shop.example.com',
  status: 'ACTIVE',
  optedIn: false,
  publicKey: 'pub_entitlement_key_1234567890abcd',
  pluginVersion: '8.2.0',
  lastSeenAt: new Date(),
  networkStatus: null as string | null,
  networkTrialStartedAt: null as Date | null,
  networkAccessUntil: null as Date | null,
  category: null,
  publicIdentityOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('entitlement helpers', () => {
  it('treats missing entitlement as free rules', () => {
    expect(isSiteNetworkEligible(baseSite as never)).toBe(false);
    expect(rulesForSite(baseSite as never)).toEqual(FREE_RULES);
  });

  it('treats active trial window as pro rules', () => {
    const site = {
      ...baseSite,
      networkStatus: 'TRIAL',
      networkAccessUntil: new Date(Date.now() + 60_000),
    };
    expect(isSiteNetworkEligible(site as never)).toBe(true);
    expect(rulesForSite(site as never)).toEqual(PRO_RULES);
  });
});

describe('POST /v1/entitlements/start-trial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a 30-day trial for a free site', async () => {
    const until = new Date(Date.now() + 30 * 86400000);
    p.communitySite.findUnique.mockResolvedValue(baseSite);
    p.communitySite.update.mockResolvedValue({
      ...baseSite,
      networkStatus: 'TRIAL',
      networkTrialStartedAt: new Date(),
      networkAccessUntil: until,
    });

    const res = await request(app).post('/v1/entitlements/start-trial').send({
      siteId: baseSite.id,
      apiKey: baseSite.publicKey,
    });

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.networkStatus).toBe('TRIAL');
    expect(res.body.rules.community_network).toBe(true);
    expect(rc.invalidate).toHaveBeenCalled();
  });

  it('refuses a second trial after the first was used', async () => {
    p.communitySite.findUnique.mockResolvedValue({
      ...baseSite,
      networkStatus: 'EXPIRED',
      networkTrialStartedAt: new Date('2026-01-01T00:00:00.000Z'),
      networkAccessUntil: new Date('2026-01-31T00:00:00.000Z'),
    });

    const res = await request(app).post('/v1/entitlements/start-trial').send({
      siteId: baseSite.id,
      apiKey: baseSite.publicKey,
    });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Trial already used/i);
  });
});

describe('POST /v1/entitlements/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached entitlement for an active trial', async () => {
    const until = new Date(Date.now() + 86400000);
    const trialSite = {
      ...baseSite,
      networkStatus: 'TRIAL',
      networkTrialStartedAt: new Date(),
      networkAccessUntil: until,
    };
    p.communitySite.findUnique.mockResolvedValue(trialSite);
    p.communitySite.update.mockResolvedValue(trialSite);

    const res = await request(app).post('/v1/entitlements/validate').send({
      siteId: baseSite.id,
      apiKey: baseSite.publicKey,
    });

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.networkAccessUntil).toBe(until.toISOString());
  });
});
