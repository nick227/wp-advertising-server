import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import {
  createCommentSchema,
  createForumComment,
  createForumPost,
  createPostSchema,
  getForumPost,
  listForumPosts,
} from '../services/forumService.js';
import {
  getCommunityUserById,
  loginCommunityUser,
  loginSchema,
  registerCommunityUser,
  registerSchema,
} from '../services/communityAuthService.js';
import {
  clearSessionCookie,
  createSessionToken,
  readSessionCookie,
  setSessionCookie,
  verifySessionToken,
} from '../services/communitySession.js';
import { unauthorized } from '../lib/errors.js';

export const forumRouter = Router();

async function requireSessionUserId(req: import('express').Request) {
  const token = readSessionCookie(req);
  if (!token) throw unauthorized('Log in required');
  const session = verifySessionToken(token);
  if (!session) throw unauthorized('Log in required');
  const user = await getCommunityUserById(session.userId);
  if (!user) throw unauthorized('Log in required');
  return user.id;
}

forumRouter.get('/forum/posts', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const posts = await listForumPosts();
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ ok: true, requestId: req.requestId, posts });
  } catch (error) {
    next(error);
  }
});

forumRouter.get('/forum/posts/:slug', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const post = await getForumPost(req.params.slug);
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.json({ ok: true, requestId: req.requestId, post });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/register', rateLimit('register', config.rateLimitRegisterMax), async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const user = await registerCommunityUser(input);
    setSessionCookie(res, createSessionToken(user.id));
    res.status(201).json({ ok: true, requestId: req.requestId, user });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/login', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await loginCommunityUser(input);
    setSessionCookie(res, createSessionToken(user.id));
    res.json({ ok: true, requestId: req.requestId, user });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/logout', rateLimit('write', config.rateLimitWriteMax), async (_req, res, next) => {
  try {
    clearSessionCookie(res);
    res.json({ ok: true, requestId: _req.requestId });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/posts', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const userId = await requireSessionUserId(req);
    const input = createPostSchema.parse(req.body);
    const post = await createForumPost(userId, input);
    res.status(201).json({ ok: true, requestId: req.requestId, post });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/posts/:slug/comments', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const userId = await requireSessionUserId(req);
    const input = createCommentSchema.parse(req.body);
    const comment = await createForumComment(userId, req.params.slug, input);
    res.status(201).json({ ok: true, requestId: req.requestId, comment });
  } catch (error) {
    next(error);
  }
});
