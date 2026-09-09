import { Router } from 'express';
import { entitlementAuthSchema, entitlementValidateSchema, isSiteNetworkEligible, startTrial, validateEntitlement, authenticateForEntitlement } from '../services/entitlementService.js';
import { activateLicense, activateLicenseSchema } from '../services/licenseActivationService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';
import { createCheckoutSession } from '../services/checkoutService.js';
import { z } from 'zod';

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
    const input = entitlementValidateSchema.parse(req.body);
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

const pluginCheckoutSchema = entitlementAuthSchema.extend({
  plan: z.enum(['monthly', 'annual']).default('monthly'),
  email: z.string().trim().email().max(255).optional(),
});

entitlementsRouter.post('/entitlements/checkout-session', rateLimit('write', config.rateLimitWriteMax), async (req, res, next) => {
  try {
    const input = pluginCheckoutSchema.parse(req.body);
    const site = await authenticateForEntitlement({ siteId: input.siteId, apiKey: input.apiKey });
    
    if (site.networkStatus === 'ACTIVE' && isSiteNetworkEligible(site)) {
      const entitlement = await validateEntitlement(input);
      res.json({ ok: true, requestId: req.requestId, status: 'already_active', entitlement });
      return;
    }
    
    const session = await createCheckoutSession({
      plan: input.plan,
      email: input.email,
      siteUrl: site.siteUrl,
      siteId: site.id,
    });
    res.json({ ok: true, requestId: req.requestId, status: 'checkout_required', checkoutUrl: session.url });
  } catch (error) {
    next(error);
  }
});
