import { nanoid } from 'nanoid';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors.js';

export const createPostSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(20000),
  type: z.enum(['DISCUSSION', 'ANNOUNCEMENT', 'POLICY', 'HELP']).default('DISCUSSION'),
  category: z.string().trim().max(64).optional(),
});

export const createCommentSchema = z.object({
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

async function requireUser(userId: string) {
  const user = await prisma.communityUser.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('Log in to continue');
  if (!user.canPost) throw forbidden('Your account cannot post right now');
  return user;
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

export async function createForumPost(userId: string, input: z.infer<typeof createPostSchema>) {
  const user = await requireUser(userId);
  if (input.type !== 'DISCUSSION' && user.role === 'MEMBER') {
    throw forbidden('Only moderators can create announcements or policy posts');
  }

  return prisma.communityPost.create({
    data: {
      authorId: user.id,
      title: input.title,
      body: input.body,
      type: input.type,
      category: input.category,
      slug: slugify(input.title),
    },
  });
}

export async function createForumComment(userId: string, slug: string, input: z.infer<typeof createCommentSchema>) {
  const user = await requireUser(userId);
  const post = await prisma.communityPost.findUnique({ where: { slug } });
  if (!post) throw notFound('Post not found');
  if (post.isLocked) throw forbidden('This post is locked');

  return prisma.communityComment.create({
    data: {
      postId: post.id,
      authorId: user.id,
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

export async function setUserCanPost(userId: string, canPost: boolean) {
  const user = await prisma.communityUser.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found');
  return prisma.communityUser.update({ where: { id: userId }, data: { canPost } });
}

/** @deprecated Use setUserCanPost */
export async function setMembershipCanPost(membershipId: string, canPost: boolean) {
  return setUserCanPost(membershipId, canPost);
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
        author: { select: { id: true, displayName: true, email: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.communityUser.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        canPost: true,
      },
    }),
  ]);
  return { posts, members };
}

export function assertNotEmptyBody(value: string, label: string) {
  if (!value.trim()) throw badRequest(`${label} is required`);
}
