import { isStripeCheckoutConfigured, isStripeWebhookConfigured, config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { rotationCache } from './rotationCache.js';
import { SOFT_LAUNCH_DOMAIN_SUFFIX } from './softLaunchSeed.js';

export async function getPublicStatus() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const now = new Date();
  const [eligibleSites, forumPosts, activeAds] = await Promise.all([
    prisma.communitySite.count({
      where: {
        optedIn: true,
        status: 'ACTIVE',
        networkStatus: { in: ['TRIAL', 'ACTIVE'] },
        OR: [{ networkAccessUntil: null }, { networkAccessUntil: { gt: now } }],
      },
    }),
    prisma.communityPost.count(),
    prisma.communityAd.count({ where: { status: 'ACTIVE' } }),
  ]);

  const rotation = rotationCache.status();
  const overall = dbOk ? 'operational' : 'degraded';

  return {
    overall,
    checkedAt: now.toISOString(),
    api: dbOk ? 'ok' : 'unavailable',
    version: config.version,
    eligibleSites,
    activeAds,
    rotationAds: rotation.items,
    forumPosts,
    checkout: isStripeCheckoutConfigured() ? 'configured' : 'not_configured',
  };
}

export async function getSoftLaunchReadiness() {
  const publicStatus = await getPublicStatus();
  const seedSites = await prisma.communitySite.count({
    where: { siteDomain: { endsWith: `.${SOFT_LAUNCH_DOMAIN_SUFFIX}` } },
  });

  const checks = {
    database: publicStatus.api === 'ok',
    eligibleSites: publicStatus.eligibleSites >= 5,
    rotationAds: publicStatus.rotationAds >= 5,
    forumSeeded: publicStatus.forumPosts >= 7,
    stripeCheckout: isStripeCheckoutConfigured(),
    stripeWebhook: isStripeWebhookConfigured(),
    pluginDownload: Boolean(config.pluginDownloadUrl),
    seedInventory: seedSites >= 5,
  };

  const ready = Object.values(checks).every(Boolean);
  return {
    ready,
    checks,
    counts: {
      eligibleSites: publicStatus.eligibleSites,
      rotationAds: publicStatus.rotationAds,
      forumPosts: publicStatus.forumPosts,
      seedSites,
      activeAds: publicStatus.activeAds,
    },
  };
}
