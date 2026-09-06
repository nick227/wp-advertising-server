import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { seedForumIfEmpty } from './forumSeed.js';

const DOMAIN_SUFFIX = 'wp-advertising.test';

type SeedSiteSpec = {
  slug: string;
  siteName: string;
  networkStatus: 'TRIAL' | 'ACTIVE';
  category: string;
  adTitle: string;
  targetPath: string;
};

const SITES: SeedSiteSpec[] = [
  { slug: 'demo-01', siteName: 'Demo Knit Shop', networkStatus: 'ACTIVE', category: 'retail', adTitle: 'Soft merino hats', targetPath: '/hats' },
  { slug: 'demo-02', siteName: 'Demo Tee Press', networkStatus: 'ACTIVE', category: 'apparel', adTitle: 'Studio tees that last', targetPath: '/tees' },
  { slug: 'demo-03', siteName: 'Demo Outdoor Co', networkStatus: 'ACTIVE', category: 'outdoors', adTitle: 'Trail caps in stock', targetPath: '/caps' },
  { slug: 'demo-04', siteName: 'Demo Craft Hub', networkStatus: 'TRIAL', category: 'maker', adTitle: 'Weekend craft kits', targetPath: '/kits' },
  { slug: 'demo-05', siteName: 'Demo Print Lab', networkStatus: 'TRIAL', category: 'print', adTitle: 'Small-batch prints', targetPath: '/prints' },
  { slug: 'demo-06', siteName: 'Demo Kids Wear', networkStatus: 'ACTIVE', category: 'kids', adTitle: 'Soft kids tees', targetPath: '/kids' },
  { slug: 'demo-07', siteName: 'Demo Vintage Finds', networkStatus: 'TRIAL', category: 'vintage', adTitle: 'Vintage graphic tees', targetPath: '/vintage' },
  { slug: 'demo-08', siteName: 'Demo Home Studio', networkStatus: 'ACTIVE', category: 'home', adTitle: 'Studio wall flags', targetPath: '/flags' },
];

function domainFor(slug: string) {
  return `${slug}.${DOMAIN_SUFFIX}`;
}

function accessUntil(status: 'TRIAL' | 'ACTIVE') {
  const days = status === 'TRIAL' ? 30 : 365;
  return new Date(Date.now() + days * 86400000);
}

async function upsertSeedSite(spec: SeedSiteSpec) {
  const siteDomain = domainFor(spec.slug);
  const siteUrl = `https://${siteDomain}/`;
  const existing = await prisma.communitySite.findUnique({ where: { siteDomain } });

  const site = existing
    ? await prisma.communitySite.update({
        where: { id: existing.id },
        data: {
          siteName: spec.siteName,
          status: 'ACTIVE',
          optedIn: true,
          networkStatus: spec.networkStatus,
          networkTrialStartedAt: existing.networkTrialStartedAt ?? new Date(),
          networkAccessUntil: accessUntil(spec.networkStatus),
          category: spec.category,
          pluginVersion: '8.3.0-seed',
          lastSeenAt: new Date(),
        },
      })
    : await prisma.communitySite.create({
        data: {
          siteUrl,
          siteDomain,
          siteName: spec.siteName,
          status: 'ACTIVE',
          optedIn: true,
          publicKey: `pub_seed_${spec.slug}_${nanoid(16)}`,
          networkStatus: spec.networkStatus,
          networkTrialStartedAt: new Date(),
          networkAccessUntil: accessUntil(spec.networkStatus),
          category: spec.category,
          pluginVersion: '8.3.0-seed',
          lastSeenAt: new Date(),
        },
      });

  const imageUrl = `https://${siteDomain}/wp-content/uploads/seed-ad.png`;
  const targetUrl = `https://${siteDomain}${spec.targetPath}`;
  const ad = await prisma.communityAd.findFirst({
    where: { siteId: site.id, title: spec.adTitle },
  });

  if (ad) {
    await prisma.communityAd.update({
      where: { id: ad.id },
      data: { imageUrl, targetUrl, status: 'ACTIVE', weight: 1 },
    });
  } else {
    await prisma.communityAd.create({
      data: {
        siteId: site.id,
        title: spec.adTitle,
        imageUrl,
        targetUrl,
        status: 'ACTIVE',
        weight: 1,
      },
    });
  }

  return { siteDomain, networkStatus: spec.networkStatus, created: !existing };
}

export async function seedSoftLaunchInventory() {
  const sites = [];
  for (const spec of SITES) {
    sites.push(await upsertSeedSite(spec));
  }
  const forum = await seedForumIfEmpty();
  return {
    sites,
    created: sites.filter((s) => s.created).length,
    updated: sites.filter((s) => !s.created).length,
    forum,
  };
}

export function softLaunchSeedAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.ALLOW_SOFT_LAUNCH_SEED === '1';
}

export { SITES as SOFT_LAUNCH_SITE_SPECS, DOMAIN_SUFFIX as SOFT_LAUNCH_DOMAIN_SUFFIX };
