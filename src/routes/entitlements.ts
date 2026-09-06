import { Router } from 'express';
import { entitlementAuthSchema, startTrial, validateEntitlement } from '../services/entitlementService.js';
import { activateLicense, activateLicenseSchema } from '../services/licenseActivationService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

export const entitlementsRouter = Router();

entitlementsRouter.post('/entitlements/start-trial', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = entitlementAuthSchema.parse(req.body);
    const entitlement = await startTrial(input);
    res.json({ ok: true, requestId: req.requestId, ...entitlement });
  } catch (error) {
    next(error);
  }
});

entitlementsRouter.post('/entitlements/validate', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = entitlementAuthSchema.parse(req.body);
    const entitlement = await validateEntitlement(input);
    res.json({ ok: true, requestId: req.requestId, ...entitlement });
  } catch (error) {
    next(error);
  }
});

entitlementsRouter.post('/entitlements/activate-license', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = activateLicenseSchema.parse(req.body);
    const entitlement = await activateLicense(input);
    res.json({ ok: true, requestId: req.requestId, ...entitlement });
  } catch (error) {
    next(error);
  }
});
