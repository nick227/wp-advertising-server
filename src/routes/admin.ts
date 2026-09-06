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
  getAdminOverview,
  grantPro,
  listAdminAds,
  listAdminLicenses,
  listAdminSites,
  resetActivations,
  revokeSite,
  setAdStatus,
  siteActionSchema,
  suspendSite,
} from '../services/adminService.js';

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
    const sites = await listAdminSites();
    res.json({ ok: true, requestId: req.requestId, sites });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/ads', async (req, res, next) => {
  try {
    const ads = await listAdminAds();
    res.json({ ok: true, requestId: req.requestId, ads });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/licenses', async (req, res, next) => {
  try {
    const licenses = await listAdminLicenses();
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
