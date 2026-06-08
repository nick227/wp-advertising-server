import { Router } from 'express';
import { registerSiteSchema, optInSchema, authSiteSchema, registerSite, heartbeat, setOptIn } from '../services/siteService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export const sitesRouter = Router();

sitesRouter.post('/sites/register', rateLimit('register', config.rateLimitRegisterMax), async (req, res, next) => {
  try {
    const input = registerSiteSchema.parse(req.body);
    res.status(201).json(await registerSite(input));
  } catch (error) {
    next(error);
  }
});

sitesRouter.post('/sites/heartbeat', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = authSiteSchema.parse(req.body);
    res.json(await heartbeat(input));
  } catch (error) {
    next(error);
  }
});

sitesRouter.post('/sites/opt-in', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = optInSchema.parse({ ...req.body, optedIn: true });
    res.json(await setOptIn(input));
  } catch (error) {
    next(error);
  }
});

sitesRouter.post('/sites/opt-out', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = optInSchema.parse({ ...req.body, optedIn: false });
    res.json(await setOptIn(input));
  } catch (error) {
    next(error);
  }
});
