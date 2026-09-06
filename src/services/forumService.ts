import { nanoid } from 'nanoid';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import {
  authenticateForEntitlement,
  entitlementAuthSchema,
  isSiteNetworkEligible,
} from './entitlementService.js';

export const joinForumSchema = entitlementAuthSchema.extend({
  displayName: z.string().trim().min(2).max(120),
});

export const createPostSchema = entitlementAuthSchema.extend({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(20000),
  type: z.enum(['DISCUSSION', 'ANNOUNCEMENT', 'POLICY', 'HELP']).default('DISCUSSION'),
  category: z.string().trim().max(64).optional(),
});

export const createCommentSchema = entitlementAuthSchema.extend({
  body: z.string().trim().min(1).max(8000),
});

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180) || 'post';
  return `${base}-${nanoid(6)}`;
}

function canWrite(site: { status: string; networkStatus: string | null; networkAccessUntil: Date | null }, membershipCanPost: boolean) {
  if (!membershipCanPost) return false;
  return isSiteNetworkEligible(site as never);
}

function canReadExpired(site: { networkStatus: string | null }) {
  return site.networkStatus === 'EXPIRED' || site.networkStatus === 'TRIAL' || site.networkStatus === 'ACTIVE';
}

export async function joinForum(input: z.infer<typeof joinForumSchema>) {
  const site = await authenticateForEntitlement(input);
  if (!isSiteNetworkEligible(site) && site.networkStatus !== 'EXPIRED') {
    throw forbidden('Active Trial/Pro or expired read-only entitlement is required to join Community');
  }

  const existing = await prisma.communityMembership.findUnique({ where: { siteId: site.id } });
  if (existing) {
    return prisma.communityMembership.update({
      where: { id: existing.id },
      data: { displayName: input.displayName },
    });
  }

  return prisma.communityMembership.create({
    data: {
      siteId: site.id,
      displayName: input.displayName,
      canPost: true,
    },
  });
}

export async function listForumPosts(limit = 50) {
  return prisma.communityPost.findMany({
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      category: true,
      isPinned: true,
      isLocked: true,
      createdAt: true,
      author: { select: { displayName: true, role: true } },
      _count: { select: { comments: true } },
    },
  });
}

export async function getForumPost(slug: string) {
  const post = await prisma.communityPost.findUnique({
    where: { slug },
    include: {
      author: { select: { displayName: true, role: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { displayName: true, role: true } } },
      },
    },
  });
  if (!post) throw notFound('Post not found');
  return post;
}

export async function createForumPost(input: z.infer<typeof createPostSchema>) {
  const site = await authenticateForEntitlement(input);
  const membership = await prisma.communityMembership.findUnique({ where: { siteId: site.id } });
  if (!membership) throw forbidden('Join the Community before posting');
  if (!canWrite(site, membership.canPost)) {
    throw forbidden('Posting requires an active Trial or Pro entitlement');
  }
  if (input.type !== 'DISCUSSION' && membership.role === 'MEMBER') {
    throw forbidden('Only moderators can create announcements or policy posts');
  }

  return prisma.communityPost.create({
    data: {
      authorId: membership.id,
      title: input.title,
      body: input.body,
      type: input.type,
      category: input.category,
      slug: slugify(input.title),
    },
  });
}

export async function createForumComment(slug: string, input: z.infer<typeof createCommentSchema>) {
  const site = await authenticateForEntitlement(input);
  const membership = await prisma.communityMembership.findUnique({ where: { siteId: site.id } });
  if (!membership) throw forbidden('Join the Community before commenting');
  if (!canWrite(site, membership.canPost)) {
    throw forbidden('Commenting requires an active Trial or Pro entitlement');
  }

  const post = await prisma.communityPost.findUnique({ where: { slug } });
  if (!post) throw notFound('Post not found');
  if (post.isLocked) throw forbidden('This post is locked');

  return prisma.communityComment.create({
    data: {
      postId: post.id,
      authorId: membership.id,
      body: input.body,
    },
  });
}

export async function setPostModeration(postId: string, data: { isPinned?: boolean; isLocked?: boolean }) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) throw notFound('Post not found');
  return prisma.communityPost.update({ where: { id: postId }, data });
}

export async function deleteForumPost(postId: string) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) throw notFound('Post not found');
  await prisma.communityPost.delete({ where: { id: postId } });
  return { id: postId, deleted: true };
}

export async function setMembershipCanPost(membershipId: string, canPost: boolean) {
  const membership = await prisma.communityMembership.findUnique({ where: { id: membershipId } });
  if (!membership) throw notFound('Membership not found');
  return prisma.communityMembership.update({ where: { id: membershipId }, data: { canPost } });
}

export async function listForumAdmin() {
  const [posts, members] = await Promise.all([
    prisma.communityPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        isPinned: true,
        isLocked: true,
        createdAt: true,
        author: { select: { id: true, displayName: true, siteId: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.communityMembership.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        displayName: true,
        role: true,
        canPost: true,
        siteId: true,
        site: { select: { siteDomain: true } },
      },
    }),
  ]);
  return { posts, members };
}

export function assertNotEmptyBody(value: string, label: string) {
  if (!value.trim()) throw badRequest(`${label} is required`);
}

export { canReadExpired };
