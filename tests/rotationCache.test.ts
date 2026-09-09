import { afterEach, expect, it, vi } from 'vitest';
const { db } = vi.hoisted(() => ({ db: {
  communityAd: { findMany: vi.fn().mockResolvedValue([]) },
  communitySite: { findMany: vi.fn().mockResolvedValue([]) },
} }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));
import { rotationCache } from '../src/services/rotationCache.js';
import { serveCommunityAd } from '../src/services/serveService.js';
afterEach(() => { rotationCache.stop(); vi.clearAllMocks(); });
it('cold ad serving reads only memory, without any database or Stripe lookup', async () => {
  expect(await serveCommunityAd({ siteUrl: 'https://example.com' }, 'request_1')).toBeNull();
  expect(db.communityAd.findMany).not.toHaveBeenCalled(); expect(db.communitySite.findMany).not.toHaveBeenCalled();
});
it('refreshes only when explicitly warmed outside the serve path', async () => {
  await rotationCache.warm(); expect(db.communityAd.findMany).toHaveBeenCalledOnce();
  await rotationCache.getSnapshot(); await rotationCache.getSnapshot();
  expect(db.communityAd.findMany).toHaveBeenCalledOnce();
});

it('enforces cached deadlines even if the database is unavailable', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = new Date('2030-01-01'); vi.setSystemTime(now);
  const deadline = new Date(now.getTime() + 1000);
  db.communitySite.findMany.mockResolvedValue([{ id: 'source', siteDomain: 'source.example.com', optedIn: true, status: 'ACTIVE', networkStatus: 'ACTIVE', networkAccessUntil: deadline }] as never);
  db.communityAd.findMany.mockResolvedValue([{ id: 'ad', siteId: 'advertiser', title: 'Ad', imageUrl: 'https://example.com/a.png', targetUrl: 'https://example.com', weight: 1, site: { siteDomain: 'example.com', networkAccessUntil: deadline } }] as never);
  await rotationCache.rebuildNow(); vi.clearAllMocks();
  expect(await serveCommunityAd({ siteUrl: 'https://source.example.com', tracking: '0' }, 'request')).not.toBeNull();
  vi.setSystemTime(new Date(deadline.getTime() + 1));
  expect(await serveCommunityAd({ siteUrl: 'https://source.example.com', tracking: '0' }, 'request')).toBeNull();
  expect(rotationCache.nextAd('source')).toBeNull();
  expect(db.communityAd.findMany).not.toHaveBeenCalled(); expect(db.communitySite.findMany).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('evicts revoked eligibility even when cache rebuilding fails', async () => {
  db.communityAd.findMany.mockRejectedValueOnce(new Error('database offline'));
  await expect(rotationCache.invalidate(['advertiser'])).rejects.toThrow('database offline');
  expect(rotationCache.nextAd('source')).toBeNull();
  expect(rotationCache.getAd('ad')).toBeNull();
});
