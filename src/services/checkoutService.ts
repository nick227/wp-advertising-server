import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { normalizeSiteUrl, publicHttpUrlSchema } from '../lib/urlUtils.js';
import { requireStripeCheckout } from './stripeClient.js';

export const checkoutSessionSchema = z.object({
  plan: z.enum(['monthly', 'annual']).default('monthly'),
  email: z.string().trim().email().max(255),
  siteUrl: publicHttpUrlSchema,
});

export async function createCheckoutSession(input: z.infer<typeof checkoutSessionSchema>) {
  const stripe = requireStripeCheckout();
  const priceId = input.plan === 'annual' ? config.stripePriceAnnual : config.stripePriceMonthly;
  if (!priceId) {
    throw badRequest(`Stripe price is not configured for plan: ${input.plan}`);
  }

  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: input.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${config.publicSiteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicSiteUrl}/checkout?canceled=1`,
    client_reference_id: siteUrl.slice(0, 200),
    metadata: {
      siteUrl,
      plan: input.plan,
    },
    subscription_data: {
      metadata: {
        siteUrl,
        plan: input.plan,
      },
    },
  });

  if (!session.url) {
    throw badRequest('Stripe Checkout Session did not return a redirect URL');
  }

  return { sessionId: session.id, url: session.url };
}
