import { Router } from 'express';
import { registerSiteSchema, optInSchema, authSiteSchema, registerSite, heartbeat, setOptIn } from '../services/siteService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import { releaseManifest } from '../services/releaseManifest.js';

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

// Public, unauthenticated — returns only latest version and download URL.
// No site identity or telemetry. Used by free/unconnected plugin installs for update awareness.
sitesRouter.get('/plugin/release', rateLimit('serve', config.rateLimitServeMax), (_req, res) => {
  if (!releaseManifest.version) {
    res.status(503).json({ error: { message: 'Release info unavailable' } });
    return;
  }
  const { download } = releaseManifest;
  res.json({
    version: releaseManifest.version,
    download: download.startsWith('/') ? config.publicSiteUrl + download : download,
  });
});
