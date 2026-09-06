import { Router } from 'express';
import { rotationCache } from '../services/rotationCache.js';
import { eventQueue } from '../services/eventQueue.js';
import { rateLimit, rateLimitStatus } from '../middleware/rateLimit.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { config } from '../config.js';
import {
  adStatusSchema,
  extendTrial,
  forceOptOut,
  grantPro,
  resetActivations,
  revokeSite,
  setAdStatus,
  siteActionSchema,
  suspendSite,
} from '../services/adminService.js';
import {
  getAdminOverview,
  getAdminSite,
  listAdminAds,
  listAdminLicenses,
  listAdminSites,
} from '../services/adminQueryService.js';
import {
  deleteForumPost,
  listForumAdmin,
  setMembershipCanPost,
  setPostModeration,
} from '../services/forumService.js';
import { seedForumIfEmpty } from '../services/forumSeed.js';

export const adminRouter = Router();

adminRouter.use('/admin', adminAuth, rateLimit('admin', config.rateLimitAdminMax));

adminRouter.get('/admin/overview', async (req, res, next) => {
  try {
    const overview = await getAdminOverview();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, requestId: req.requestId, ...overview });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/cache/rebuild', async (req, res, next) => {
  try {
    const rotation = await rotationCache.rebuildNow();
    res.json({ ok: true, requestId: req.requestId, rotation });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/metrics', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    requestId: req.requestId,
    rotation: rotationCache.status(),
    events: eventQueue.status(),
    rateLimits: rateLimitStatus(),
  });
});

adminRouter.post('/admin/events/flush', async (req, res, next) => {
  try {
    await eventQueue.flush();
    res.json({ ok: true, requestId: req.requestId, events: eventQueue.status() });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/sites', async (req, res, next) => {
  try {
    const sites = await listAdminSites({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      networkStatus: typeof req.query.networkStatus === 'string' ? req.query.networkStatus : undefined,
      optedIn: typeof req.query.optedIn === 'string' ? req.query.optedIn : undefined,
    });
    res.json({ ok: true, requestId: req.requestId, sites });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/sites/:siteId', async (req, res, next) => {
  try {
    const site = await getAdminSite(req.params.siteId);
    res.json({ ok: true, requestId: req.requestId, site });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/ads', async (req, res, next) => {
  try {
    const ads = await listAdminAds({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ ok: true, requestId: req.requestId, ads });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/licenses', async (req, res, next) => {
  try {
    const licenses = await listAdminLicenses({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    res.json({ ok: true, requestId: req.requestId, licenses });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/sites/:siteId/extend-trial', async (req, res, next) => {
  try {
    const { days } = siteActionSchema.parse(req.body ?? {});
    const site = await extendTrial(req.params.siteId, days);
    res.json({ ok: true, requestId: req.requestId, site });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/sites/:siteId/grant-pro', async (req, res, next) => {
  try {
    const { days } = siteActionSchema.parse(req.body ?? {});
    const site = await grantPro(req.params.siteId, days ?? 30);
    res.json({ ok: true, requestId: req.requestId, site });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/sites/:siteId/suspend', async (req, res, next) => {
  try {
    const site = await suspendSite(req.params.siteId);
    res.json({ ok: true, requestId: req.requestId, site });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/sites/:siteId/revoke', async (req, res, next) => {
  try {
    const site = await revokeSite(req.params.siteId);
    res.json({ ok: true, requestId: req.requestId, site });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/sites/:siteId/opt-out', async (req, res, next) => {
  try {
    const site = await forceOptOut(req.params.siteId);
    res.json({ ok: true, requestId: req.requestId, site });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/sites/:siteId/reset-activation', async (req, res, next) => {
  try {
    const result = await resetActivations(req.params.siteId);
    res.json({ ok: true, requestId: req.requestId, ...result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/ads/:adId/status', async (req, res, next) => {
  try {
    const { status } = adStatusSchema.parse(req.body ?? {});
    const ad = await setAdStatus(req.params.adId, status);
    res.json({ ok: true, requestId: req.requestId, ad });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/forum', async (req, res, next) => {
  try {
    const data = await listForumAdmin();
    res.json({ ok: true, requestId: req.requestId, ...data });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/forum/posts/:postId/moderate', async (req, res, next) => {
  try {
    const post = await setPostModeration(req.params.postId, {
      isPinned: typeof req.body?.isPinned === 'boolean' ? req.body.isPinned : undefined,
      isLocked: typeof req.body?.isLocked === 'boolean' ? req.body.isLocked : undefined,
    });
    res.json({ ok: true, requestId: req.requestId, post });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/forum/posts/:postId/delete', async (req, res, next) => {
  try {
    const result = await deleteForumPost(req.params.postId);
    res.json({ ok: true, requestId: req.requestId, ...result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/forum/members/:membershipId/can-post', async (req, res, next) => {
  try {
    const membership = await setMembershipCanPost(req.params.membershipId, Boolean(req.body?.canPost));
    res.json({ ok: true, requestId: req.requestId, membership });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/admin/forum/seed', async (req, res, next) => {
  try {
    const result = await seedForumIfEmpty();
    res.json({ ok: true, requestId: req.requestId, ...result });
  } catch (error) {
    next(error);
  }
});
