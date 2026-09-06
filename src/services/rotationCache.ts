import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { normalizeDomain } from '../lib/urlUtils.js';
import type { NetworkStatus } from '@prisma/client';

export type RotationAd = {
  adId: string;
  siteId: string;
  siteDomain: string;
  title: string;
  imageUrl: string;
  targetUrl: string;
  weight: number;
  networkAccessUntil: number | null;
};

type SiteSnapshot = {
  id: string;
  siteDomain: string;
  optedIn: boolean;
  status: string;
  networkStatus: NetworkStatus | null;
  networkAccessUntil: number | null;
};
type CacheState = {
  ads: RotationAd[];
  siteByDomain: Map<string, SiteSnapshot>;
  adById: Map<string, RotationAd>;
  refreshedAt: number;
  cursor: number;
  version: number;
  lastBuildMs: number | null;
  lastError: string | null;
  loading?: Promise<void>;
};

const state: CacheState = {
  ads: [],
  siteByDomain: new Map(),
  adById: new Map(),
  refreshedAt: 0,
  cursor: 0,
  version: 0,
  lastBuildMs: null,
  lastError: null,
};

export const rotationCache = {
  async warm() {
    await refreshRotationCache({ allowStale: false });
  },
  async invalidate() {
    state.refreshedAt = 0;
    refreshRotationCache({ allowStale: true }).catch((error) => {
      console.error('rotation cache refresh failed after invalidation', error);
    });
  },
  async rebuildNow() {
    await refreshRotationCache({ allowStale: false, force: true });
    return this.status();
  },
  async getSnapshot() {
    const expired = Date.now() - state.refreshedAt > config.rotationCacheTtlMs;
    if (expired) {
      await refreshRotationCache({ allowStale: state.ads.length > 0 });
    }
    return {
      ads: state.ads,
      siteByDomain: state.siteByDomain,
      refreshedAt: state.refreshedAt,
      cursor: state.cursor,
      version: state.version,
    };
  },
  getAd(adId: string) {
    return state.adById.get(adId) || null;
  },
  nextAd(sourceSiteId: string, sourceDomain?: string) {
  if (state.ads.length === 0) return null;

  const normalizedSourceDomain = sourceDomain ? normalizeDomain(sourceDomain) : undefined;
  let fallback: RotationAd | null = null;
  const now = Date.now();

  const attempts = state.ads.length;

  for (let i = 0; i < attempts; i += 1) {
    const idx = state.cursor % state.ads.length;
    state.cursor = (state.cursor + 1) % state.ads.length;

    const ad = state.ads[idx];
    if (ad.networkAccessUntil !== null && ad.networkAccessUntil <= now) {
      continue;
    }

    const isSameSite =
      ad.siteId === sourceSiteId ||
      Boolean(normalizedSourceDomain && normalizeDomain(ad.siteDomain) === normalizedSourceDomain);

    if (!isSameSite) {
      return ad;
    }

    // Keep the first self-ad as fallback for one-site MVP/no-fill prevention.
    if (!fallback) {
      fallback = ad;
    }
  }

  return fallback;
},
  status() {
    return {
      version: state.version,
      items: state.ads.length,
      sites: state.siteByDomain.size,
      lastBuiltAt: state.refreshedAt ? new Date(state.refreshedAt).toISOString() : null,
      lastBuildMs: state.lastBuildMs,
      lastError: state.lastError,
      ttlMs: config.rotationCacheTtlMs,
      cursor: state.cursor,
      loading: Boolean(state.loading),
    };
  },
};

async function refreshRotationCache(options: { allowStale?: boolean; force?: boolean } = {}) {
  const expired = Date.now() - state.refreshedAt > config.rotationCacheTtlMs;
  if (!options.force && !expired && state.refreshedAt > 0) return;

  if (state.loading) {
    if (options.allowStale) return;
    await state.loading;
    return;
  }

  state.loading = doRefresh().finally(() => {
    state.loading = undefined;
  });

  if (options.allowStale) return;
  await state.loading;
}

async function doRefresh() {
  const started = Date.now();
  const now = new Date();
  try {
    const [ads, sites] = await Promise.all([
      prisma.communityAd.findMany({
        where: {
          status: 'ACTIVE',
          site: {
            optedIn: true,
            status: 'ACTIVE',
            networkStatus: { in: ['TRIAL', 'ACTIVE'] },
            networkAccessUntil: { gt: now },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          siteId: true,
          title: true,
          imageUrl: true,
          targetUrl: true,
          weight: true,
          site: { select: { siteDomain: true, networkAccessUntil: true } },
        },
      }),
      prisma.communitySite.findMany({
        select: {
          id: true,
          siteDomain: true,
          optedIn: true,
          status: true,
          networkStatus: true,
          networkAccessUntil: true,
        },
      }),
    ]);

    const weighted: RotationAd[] = [];
    for (const ad of ads) {
      const copies = Math.max(1, Math.min(ad.weight || 1, 10));
      const networkAccessUntil = ad.site.networkAccessUntil ? ad.site.networkAccessUntil.getTime() : null;
      for (let i = 0; i < copies; i += 1) {
        weighted.push({
          adId: ad.id,
          siteId: ad.siteId,
          siteDomain: normalizeDomain(ad.site.siteDomain),
          title: ad.title,
          imageUrl: ad.imageUrl,
          targetUrl: ad.targetUrl,
          weight: ad.weight,
          networkAccessUntil,
        });
      }
    }

    // Atomic-ish swap: build all structures first, then replace the live state together.
    const nextAdById = new Map(weighted.map((ad) => [ad.adId, ad]));
    const nextSiteByDomain = new Map<string, SiteSnapshot>();
    for (const site of sites) {
      const siteDomain = normalizeDomain(site.siteDomain);
      nextSiteByDomain.set(siteDomain, {
        id: site.id,
        siteDomain,
        optedIn: site.optedIn,
        status: site.status,
        networkStatus: site.networkStatus,
        networkAccessUntil: site.networkAccessUntil ? site.networkAccessUntil.getTime() : null,
      });
    }
    const nextCursor = weighted.length === 0 ? 0 : state.cursor % weighted.length;

    state.ads = weighted;
    state.adById = nextAdById;
    state.siteByDomain = nextSiteByDomain;
    state.cursor = nextCursor;
    state.refreshedAt = Date.now();
    state.version += 1;
    state.lastBuildMs = Date.now() - started;
    state.lastError = null;
  } catch (error) {
    state.lastBuildMs = Date.now() - started;
    state.lastError = error instanceof Error ? error.message : 'Unknown cache refresh error';
    // Keep the previous cache. Serve can continue from stale-but-known-good data.
    throw error;
  }
}
