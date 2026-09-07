import { beforeEach, describe, expect, it, vi } from 'vitest';

const { p } = vi.hoisted(() => {
  const p = {
    communitySite: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    communityAd: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    communityPost: { count: vi.fn() },
    communityUser: { findUnique: vi.fn(), create: vi.fn() },
  };
  return { p };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));

import {
  seedSoftLaunchInventory,
  softLaunchSeedAllowed,
  SOFT_LAUNCH_SITE_SPECS,
} from '../src/services/softLaunchSeed.js';

describe('softLaunchSeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.communityPost.count.mockResolvedValue(7);
  });

  it('requires ALLOW_SOFT_LAUNCH_SEED=1', () => {
    expect(softLaunchSeedAllowed({})).toBe(false);
    expect(softLaunchSeedAllowed({ ALLOW_SOFT_LAUNCH_SEED: 'true' })).toBe(false);
    expect(softLaunchSeedAllowed({ ALLOW_SOFT_LAUNCH_SEED: '1' })).toBe(true);
  });

  it('creates missing demo sites and ads', async () => {
    p.communitySite.findUnique.mockResolvedValue(null);
    p.communitySite.create.mockImplementation(async ({ data }: { data: { siteDomain: string } }) => ({
      id: `id_${data.siteDomain}`,
      ...data,
    }));
    p.communityAd.findFirst.mockResolvedValue(null);
    p.communityAd.create.mockResolvedValue({ id: 'ad_1' });

    const result = await seedSoftLaunchInventory();

    expect(SOFT_LAUNCH_SITE_SPECS).toHaveLength(8);
    expect(result.created).toBe(8);
    expect(result.updated).toBe(0);
    expect(p.communitySite.create).toHaveBeenCalledTimes(8);
    expect(p.communityAd.create).toHaveBeenCalledTimes(8);
    expect(result.sites[0].siteDomain).toBe('demo-01.wp-advertising.test');
  });

  it('updates existing demo sites without duplicating ads', async () => {
    p.communitySite.findUnique.mockResolvedValue({
      id: 'site_existing',
      networkTrialStartedAt: new Date('2026-01-01'),
    });
    p.communitySite.update.mockResolvedValue({ id: 'site_existing' });
    p.communityAd.findFirst.mockResolvedValue({ id: 'ad_existing' });
    p.communityAd.update.mockResolvedValue({ id: 'ad_existing' });

    const result = await seedSoftLaunchInventory();

    expect(result.created).toBe(0);
    expect(result.updated).toBe(8);
    expect(p.communitySite.create).not.toHaveBeenCalled();
    expect(p.communityAd.create).not.toHaveBeenCalled();
    expect(p.communityAd.update).toHaveBeenCalledTimes(8);
  });
});
