import type Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { getBillingConfig, verifyPlanPrice } from './billingConfigService.js';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { normalizeSiteUrl, publicHttpUrlSchema } from '../lib/urlUtils.js';
import { requireStripeCheckout } from './stripeClient.js';

export const checkoutSessionSchema = z.object({
  plan: z.enum(['monthly', 'annual', 'oneTime']).default('monthly'),
  email: z.string().trim().email().max(255).optional(),
  siteUrl: publicHttpUrlSchema,
  siteId: z.string().min(1).optional(),
});

export async function createCheckoutSession(input: z.infer<typeof checkoutSessionSchema>) {
  const stripe = requireStripeCheckout();
  const settings = await getBillingConfig();
  const priceId = settings[`${input.plan}PriceId`];
  if (!settings[`${input.plan}Enabled`] || !priceId) {
    throw badRequest(`Stripe price is not configured for plan: ${input.plan}`);
  }

  await verifyPlanPrice(settings, input.plan);
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  
  const success_url = input.siteId 
    ? `${siteUrl}/wp-admin/admin.php?page=wp-advertising&stripe_success=1&session_id={CHECKOUT_SESSION_ID}` 
    : `${config.publicSiteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  
  const cancel_url = input.siteId 
    ? `${siteUrl}/wp-admin/admin.php?page=wp-advertising&stripe_canceled=1`
    : `${config.publicSiteUrl}/checkout?canceled=1`;
    
  const mode = input.plan === 'oneTime' ? 'payment' : 'subscription';
  const effectiveConfig = {
    priceId,
    mode,
    trialDays: settings.trialDays,
    success_url,
    cancel_url,
    plan: input.plan
  };
  const configHash = createHash('sha256').update(JSON.stringify(effectiveConfig)).digest('hex').slice(0, 24);
  
  const sessionData: Stripe.Checkout.SessionCreateParams = {
    mode,
    customer_email: input.email || undefined,
    line_items: [{ price: priceId as string, quantity: 1 }],
    success_url,
    cancel_url,
    client_reference_id: input.siteId ? input.siteId : siteUrl.slice(0, 200),
    metadata: {
      application: 'wp-advertising',
      siteId: input.siteId || '',
      siteUrl,
      plan: input.plan,
    },
  };
  
  if (mode === 'subscription') {
    sessionData.subscription_data = {
      metadata: {
        application: 'wp-advertising', failureGraceDays: String(settings.failureGraceDays),
        siteId: input.siteId || '', siteUrl, plan: input.plan,
      },
    };
  } else {
    sessionData.payment_intent_data = {
      metadata: {
        application: 'wp-advertising',
        siteId: input.siteId || '', siteUrl, plan: input.plan,
      },
    };
  }
  
  const session = await stripe.checkout.sessions.create(sessionData, input.siteId ? {
    idempotencyKey: `checkout_${input.siteId}_${input.plan}_${priceId}_${configHash}`,
  } : undefined);

  if (!session.url) {
    throw badRequest('Stripe Checkout Session did not return a redirect URL');
  }

  return { sessionId: session.id, url: session.url };
}
