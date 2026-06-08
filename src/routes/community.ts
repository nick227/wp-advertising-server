import { Router } from 'express';
import { serveCommunityAd, serveQuerySchema, verifyEventToken } from '../services/serveService.js';
import { eventBodySchema, recordEvent } from '../services/eventService.js';
import { rotationCache } from '../services/rotationCache.js';
import { eventQueue } from '../services/eventQueue.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

export const communityRouter = Router();

communityRouter.get('/community/serve', rateLimit('serve', config.rateLimitServeMax), async (req, res, next) => {
  try {
    const input = serveQuerySchema.parse(req.query);
    const ad = await serveCommunityAd(input, req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    if (!ad) {
      res.status(204).send();
      return;
    }
    res.json(ad);
  } catch (error) {
    next(error);
  }
});

communityRouter.post('/community/events', rateLimit('events', config.rateLimitEventsMax), async (req, res, next) => {
  try {
    const input = eventBodySchema.parse(req.body);
    await recordEvent(input, req);
    res.status(202).json({ ok: true, requestId: req.requestId, events: eventQueue.status() });
  } catch (error) {
    next(error);
  }
});

communityRouter.get('/community/events/impression', rateLimit('events', config.rateLimitEventsMax), async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    await recordEvent({ token, type: 'IMPRESSION', referrer: String(req.query.referrer || '') }, req);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
  } catch (error) {
    next(error);
  }
});

communityRouter.get('/community/events/click', rateLimit('events', config.rateLimitEventsMax), async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    const payload = verifyEventToken(token);
    await recordEvent({ token, type: 'CLICK', referrer: String(req.query.referrer || '') }, req);
    let targetUrl = payload ? rotationCache.getAd(payload.adId)?.targetUrl : undefined;
    if (!targetUrl && payload) {
      const ad = await prisma.communityAd.findUnique({ where: { id: payload.adId }, select: { targetUrl: true } });
      targetUrl = ad?.targetUrl;
    }
    if (!targetUrl) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ad not found or expired', requestId: req.requestId } });
      return;
    }
    res.redirect(302, targetUrl);
  } catch (error) {
    next(error);
  }
});

communityRouter.get('/community/status', adminAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, requestId: req.requestId, rotation: rotationCache.status(), events: eventQueue.status() });
});
