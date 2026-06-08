import { Router } from 'express';
import { rotationCache } from '../services/rotationCache.js';
import { eventQueue } from '../services/eventQueue.js';
import { rateLimit, rateLimitStatus } from '../middleware/rateLimit.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

export const adminRouter = Router();

adminRouter.use('/admin', adminAuth, rateLimit('admin', config.rateLimitAdminMax));

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
  res.json({ ok: true, requestId: req.requestId, rotation: rotationCache.status(), events: eventQueue.status(), rateLimits: rateLimitStatus() });
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
    const sites = await prisma.communitySite.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, siteUrl: true, siteDomain: true, siteName: true, status: true, optedIn: true, pluginVersion: true, lastSeenAt: true, updatedAt: true },
    });
    res.json({ ok: true, requestId: req.requestId, sites });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/admin/ads', async (req, res, next) => {
  try {
    const ads = await prisma.communityAd.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, siteId: true, title: true, imageUrl: true, targetUrl: true, status: true, weight: true, servedCount: true, clickCount: true, updatedAt: true },
    });
    res.json({ ok: true, requestId: req.requestId, ads });
  } catch (error) {
    next(error);
  }
});
