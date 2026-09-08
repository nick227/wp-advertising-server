import { prisma } from '../lib/prisma.js';
import { getStripe } from './stripeClient.js';

export async function lookupLicenseForCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const subscriptionId = stripeRefId(session.subscription);
  if (!subscriptionId) {
    return { session, license: null, pending: true as const };
  }
  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });
  return { session, license, pending: !license };
}

export function stripeRefId(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}
