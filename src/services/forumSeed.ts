import { prisma } from '../lib/prisma.js';

const PINNED: Array<{ title: string; type: 'POLICY' | 'ANNOUNCEMENT' | 'HELP' | 'DISCUSSION'; category: string; body: string }> = [
  {
    title: 'How WP Advertising inventory exchange works',
    type: 'HELP',
    category: 'governance',
    body: 'Eligible Trial/Pro sites sync one house creative and receive partner creatives via server-to-server /community/serve. Clicks go directly to the advertiser destination.',
  },
  {
    title: 'How community impressions and clicks are counted',
    type: 'HELP',
    category: 'governance',
    body: 'A successful Community serve counts as the delivery/impression signal. There is no browser→Railway tracking pixel in distributed creative HTML.',
  },
  {
    title: 'Publisher privacy and anonymized reporting',
    type: 'POLICY',
    category: 'governance',
    body: 'Operators see real domains in owner admin. Advertiser-facing anonymized publisher reporting remains deferred; default privacy still avoids leaking publisher identity to other publishers.',
  },
  {
    title: 'Should high-traffic sites earn more distribution?',
    type: 'DISCUSSION',
    category: 'governance',
    body: 'Contribution-weighted fairness is intentionally not implemented at launch. Discuss goals and failure modes here before any weighting ships.',
  },
  {
    title: 'Should publisher identities ever be disclosed?',
    type: 'DISCUSSION',
    category: 'governance',
    body: 'Default is anonymized advertiser views later. Optional identity opt-in may arrive after soft launch based on member feedback.',
  },
  {
    title: 'Community advertising standards',
    type: 'POLICY',
    category: 'governance',
    body: 'No illegal, deceptive, or abusive creatives. Operators may pause/block ads and suspend network entitlement for violations.',
  },
  {
    title: 'Proposed network roadmap',
    type: 'ANNOUNCEMENT',
    category: 'governance',
    body: 'Current focus: sales pipeline, operator admin data, and this simple forum. Anonymized advertiser analytics stay low priority until soft launch metrics are healthy.',
  },
];

export async function seedForumIfEmpty() {
  const count = await prisma.communityPost.count();
  if (count > 0) return { seeded: false, posts: count };

  let site = await prisma.communitySite.findUnique({ where: { siteDomain: 'wp-advertising.official' } });
  if (!site) {
    site = await prisma.communitySite.create({
      data: {
        siteUrl: 'https://wp-advertising.official/',
        siteDomain: 'wp-advertising.official',
        siteName: 'WP Advertising Official',
        publicKey: `pub_official_${Date.now()}`,
        networkStatus: 'ACTIVE',
        networkAccessUntil: new Date(Date.now() + 3650 * 86400000),
        optedIn: false,
      },
    });
  }

  let membership = await prisma.communityMembership.findUnique({ where: { siteId: site.id } });
  if (!membership) {
    membership = await prisma.communityMembership.create({
      data: {
        siteId: site.id,
        displayName: 'WP Advertising Team',
        role: 'ADMIN',
        canPost: true,
      },
    });
  }

  for (const item of PINNED) {
    const slug = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 180);
    await prisma.communityPost.create({
      data: {
        authorId: membership.id,
        title: item.title,
        body: item.body,
        type: item.type,
        category: item.category,
        slug,
        isPinned: true,
      },
    });
  }

  return { seeded: true, posts: PINNED.length };
}
