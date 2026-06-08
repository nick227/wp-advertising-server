import { Router } from 'express';
import { upsertAdSchema, upsertSiteAd } from '../services/adService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export const adsRouter = Router();

adsRouter.post('/sites/ad', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = upsertAdSchema.parse(req.body);
    res.json(await upsertSiteAd(input));
  } catch (error) {
    next(error);
  }
});
