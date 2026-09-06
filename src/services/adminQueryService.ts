import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { rotationCache } from './rotationCache.js';
import { eventQueue } from './eventQueue.js';
import { rateLimitStatus } from '../middleware/rateLimit.js';
import { getSoftLaunchReadiness } from './publicStatusService.js';

const siteSelect = {
  id: true,
  siteUrl: true,
  siteDomain: true,
  siteName: true,
  status: true,
  optedIn: true,
  pluginVersion: true,
  lastSeenAt: true,
  networkStatus: true,
  networkTrialStartedAt: true,
  networkAccessUntil: true,
  updatedAt: true,
  createdAt: true,
} as const;

export type AdminSiteQuery = {
  q?: string;
  networkStatus?: string;
  optedIn?: string;
};

export async function listAdminSites(query: AdminSiteQuery = {}) {
  const where: Prisma.CommunitySiteWhereInput = {};
  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { siteDomain: { contains: q } },
      { siteUrl: { contains: q } },
      { siteName: { contains: q } },
      { id: { contains: q } },
    ];
  }
  if (query.networkStatus && query.networkStatus !== 'ALL') {
    if (query.networkStatus === 'NONE') where.networkStatus = null;
    else {
      where.networkStatus = query.networkStatus as
        | 'TRIAL'
        | 'ACTIVE'
        | 'EXPIRED'
        | 'SUSPENDED'
        | 'REVOKED';
    }
  }
  if (query.optedIn === '1') where.optedIn = true;
  if (query.optedIn === '0') where.optedIn = false;

  const sites = await prisma.communitySite.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      ...siteSelect,
      ads: { select: { servedCount: true, clickCount: true, status: true } },
      _count: { select: { ads: true, activations: true } },
    },
  });

  return sites.map((site) => {
    const served = site.ads.reduce((n, ad) => n + ad.servedCount, 0);
    const clicks = site.ads.reduce((n, ad) => n + ad.clickCount, 0);
    const activeAds = site.ads.filter((ad) => ad.status === 'ACTIVE').length;
    const { ads: _ads, ...rest } = site;
    return { ...rest, servedCount: served, clickCount: clicks, activeAds };
  });
}

export async function getAdminSite(siteId: string) {
  const site = await prisma.communitySite.findUnique({
    where: { id: siteId },
    select: {
      ...siteSelect,
      ads: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          weight: true,
          servedCount: true,
          clickCount: true,
          targetUrl: true,
          imageUrl: true,
          updatedAt: true,
        },
      },
      activations: {
        where: { deactivatedAt: null },
        select: {
          id: true,
          activatedAt: true,
          lastValidatedAt: true,
          domainSnapshot: true,
          license: {
            select: {
              id: true,
              licenseKey: true,
              status: true,
              customerEmail: true,
              expiresAt: true,
              stripeSubscriptionId: true,
            },
          },
        },
      },
    },
  });
  if (!site) throw notFound('Community site not found');
  return site;
}

export async function listAdminAds(query: { q?: string; status?: string } = {}) {
  const where: Prisma.CommunityAdWhereInput = {};
  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { targetUrl: { contains: q } },
      { site: { siteDomain: { contains: q } } },
      { id: { contains: q } },
    ];
  }
  if (query.status && query.status !== 'ALL') {
    where.status = query.status as 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'PENDING' | 'REJECTED';
  }

  return prisma.communityAd.findMany({
    where,
    orderBy: [{ servedCount: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      siteId: true,
      title: true,
      imageUrl: true,
      targetUrl: true,
      status: true,
      weight: true,
      servedCount: true,
      clickCount: true,
      updatedAt: true,
      site: { select: { siteDomain: true, siteUrl: true, networkStatus: true } },
    },
  });
}

export async function listAdminLicenses(query: { q?: string } = {}) {
  const q = query.q?.trim();
  return prisma.license.findMany({
    where: q
      ? {
          OR: [
            { licenseKey: { contains: q } },
            { customerEmail: { contains: q } },
            { stripeSubscriptionId: { contains: q } },
            { stripeCustomerId: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      activations: {
        where: { deactivatedAt: null },
        select: {
          id: true,
          siteId: true,
          domainSnapshot: true,
          activatedAt: true,
          lastValidatedAt: true,
        },
      },
    },
  });
}

export async function getAdminOverview() {
  const [
    siteCount,
    optedInCount,
    adCount,
    licenseCount,
    byNetwork,
    byAdStatus,
    delivery,
    topAds,
    recentSites,
  ] = await Promise.all([
    prisma.communitySite.count(),
    prisma.communitySite.count({ where: { optedIn: true } }),
    prisma.communityAd.count(),
    prisma.license.count({ where: { status: 'ACTIVE' } }),
    prisma.communitySite.groupBy({ by: ['networkStatus'], _count: { _all: true } }),
    prisma.communityAd.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.communityAd.aggregate({ _sum: { servedCount: true, clickCount: true } }),
    prisma.communityAd.findMany({
      orderBy: { servedCount: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        servedCount: true,
        clickCount: true,
        status: true,
        site: { select: { siteDomain: true, siteUrl: true } },
      },
    }),
    prisma.communitySite.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: 8,
      select: {
        id: true,
        siteDomain: true,
        networkStatus: true,
        optedIn: true,
        lastSeenAt: true,
      },
    }),
  ]);

  const serves = delivery._sum.servedCount ?? 0;
  const clicks = delivery._sum.clickCount ?? 0;

  return {
    counts: {
      sites: siteCount,
      optedIn: optedInCount,
      ads: adCount,
      activeLicenses: licenseCount,
      serves,
      clicks,
      ctr: serves > 0 ? Number(((clicks / serves) * 100).toFixed(2)) : 0,
    },
    networkStatus: Object.fromEntries(
      byNetwork.map((row) => [row.networkStatus ?? 'NONE', row._count._all]),
    ),
    adStatus: Object.fromEntries(byAdStatus.map((row) => [row.status, row._count._all])),
    topAds,
    recentSites,
    softLaunch: await getSoftLaunchReadiness(),
    rotation: rotationCache.status(),
    events: eventQueue.status(),
    rateLimits: rateLimitStatus(),
  };
}
