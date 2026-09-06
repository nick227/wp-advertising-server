import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import {
  createCommentSchema,
  createForumComment,
  createForumPost,
  createPostSchema,
  getForumPost,
  joinForum,
  joinForumSchema,
  listForumPosts,
} from '../services/forumService.js';

export const forumRouter = Router();

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

forumRouter.post('/forum/join', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = joinForumSchema.parse(req.body);
    const membership = await joinForum(input);
    res.status(201).json({ ok: true, requestId: req.requestId, membership });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/posts', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = createPostSchema.parse(req.body);
    const post = await createForumPost(input);
    res.status(201).json({ ok: true, requestId: req.requestId, post });
  } catch (error) {
    next(error);
  }
});

forumRouter.post('/forum/posts/:slug/comments', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = createCommentSchema.parse(req.body);
    const comment = await createForumComment(req.params.slug, input);
    res.status(201).json({ ok: true, requestId: req.requestId, comment });
  } catch (error) {
    next(error);
  }
});
