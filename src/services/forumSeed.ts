import { prisma } from '../lib/prisma.js';
import { hashPassword } from './communitySession.js';

const PINNED: Array<{ title: string; type: 'POLICY' | 'ANNOUNCEMENT' | 'HELP' | 'DISCUSSION'; category: string; body: string }> = [
  {
    title: 'Welcome to the WP Advertising Community',
    type: 'ANNOUNCEMENT',
    category: 'general',
    body: 'This is a discussion space for people using the WP Advertising plugin. Create an account with email and password to post and comment.',
  },
  {
    title: 'How house ads work in the plugin',
    type: 'HELP',
    category: 'general',
    body: 'Create an ad in WordPress, pick a theme, preview it, then place it with a shortcode or embed on your pages.',
  },
  {
    title: 'Optional shared community ads',
    type: 'HELP',
    category: 'general',
    body: 'Premium can connect your site so you show an ad from another opted-in site and share one of yours in return. Free installs stay on your own site.',
  },
  {
    title: 'Community advertising standards',
    type: 'POLICY',
    category: 'governance',
    body: 'No illegal, deceptive, or abusive ads. Operators may remove posts or pause accounts that break these rules.',
  },
  {
    title: 'Questions and feedback',
    type: 'DISCUSSION',
    category: 'general',
    body: 'Ask questions about installs, embeds, WooCommerce product ads, tracking, or Premium. Keep threads useful for other plugin users.',
  },
];

export async function seedForumIfEmpty() {
  const count = await prisma.communityPost.count();
  if (count > 0) return { seeded: false, posts: count };

  let user = await prisma.communityUser.findUnique({ where: { email: 'team@wp-advertising.official' } });
  if (!user) {
    user = await prisma.communityUser.create({
      data: {
        email: 'team@wp-advertising.official',
        passwordHash: hashPassword(`seed-${Date.now()}-${Math.random()}`),
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
        authorId: user.id,
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
