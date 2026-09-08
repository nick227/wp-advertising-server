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
