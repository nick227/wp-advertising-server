import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { rotationCache } from '../services/rotationCache.js';
import { eventQueue } from '../services/eventQueue.js';
import { rateLimitStatus } from '../middleware/rateLimit.js';
import { adminAuth } from '../middleware/adminAuth.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: config.serviceName, version: config.version, db: 'ok', requestId: req.requestId });
  } catch {
    res.status(503).json({ ok: false, service: config.serviceName, version: config.version, db: 'unavailable', requestId: req.requestId });
  }
});

healthRouter.get('/metrics', adminAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, requestId: req.requestId, rotation: rotationCache.status(), events: eventQueue.status(), rateLimits: rateLimitStatus() });
});
