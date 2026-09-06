import type Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { activateProEntitlement, stripeRefId } from './billingService.js';
import { getStripe } from './stripeClient.js';
import { rotationCache } from './rotationCache.js';

const FALLBACK_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;

export async function applyCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const siteUrl = session.metadata?.siteUrl || session.client_reference_id;
  if (!siteUrl) throw badRequest('Checkout session missing siteUrl metadata');

  const subscriptionId = stripeRefId(session.subscription);
  const customerId = stripeRefId(session.customer);
  const accessUntil = await resolveAccessUntil(subscriptionId);

  return activateProEntitlement({
    siteUrl,
    customerEmail: session.customer_details?.email || session.customer_email,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    accessUntil,
  });
}

export async function applySubscriptionUpdated(subscription: Stripe.Subscription) {
  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    include: { activations: { where: { deactivatedAt: null } } },
  });
  if (!license) return null;

  const accessUntil = new Date(subscription.current_period_end * 1000);
  const status = subscription.status === 'active' || subscription.status === 'trialing'
    ? 'ACTIVE' as const
    : subscription.status === 'past_due'
      ? 'SUSPENDED' as const
      : 'EXPIRED' as const;

  const updated = await prisma.license.update({
    where: { id: license.id },
    data: {
      status,
      expiresAt: accessUntil,
      stripeCustomerId: stripeRefId(subscription.customer) ?? license.stripeCustomerId,
    },
  });

  const networkStatus = status === 'ACTIVE' ? 'ACTIVE' as const
    : status === 'SUSPENDED' ? 'SUSPENDED' as const
      : 'EXPIRED' as const;

  for (const activation of license.activations) {
    await prisma.communitySite.update({
      where: { id: activation.siteId },
      data: {
        networkStatus,
        networkAccessUntil: accessUntil,
        ...(networkStatus === 'EXPIRED' || networkStatus === 'SUSPENDED' ? { optedIn: false } : {}),
      },
    });
  }

  await rotationCache.invalidate();
  return updated;
}

export async function applySubscriptionDeleted(subscription: Stripe.Subscription) {
  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    include: { activations: { where: { deactivatedAt: null } } },
  });
  if (!license) return null;

  await prisma.license.update({
    where: { id: license.id },
    data: { status: 'EXPIRED', expiresAt: new Date() },
  });

  for (const activation of license.activations) {
    await prisma.communitySite.update({
      where: { id: activation.siteId },
      data: { networkStatus: 'EXPIRED', optedIn: false },
    });
    await prisma.licenseActivation.update({
      where: { id: activation.id },
      data: { deactivatedAt: new Date() },
    });
  }

  await rotationCache.invalidate();
  return license;
}

export async function dispatchStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await applyCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case 'customer.subscription.updated':
      await applySubscriptionUpdated(event.data.object as Stripe.Subscription);
      return;
    case 'customer.subscription.deleted':
      await applySubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    default:
      return;
  }
}

async function resolveAccessUntil(subscriptionId?: string) {
  if (!subscriptionId) return new Date(Date.now() + FALLBACK_ACCESS_MS);
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return new Date(subscription.current_period_end * 1000);
}
