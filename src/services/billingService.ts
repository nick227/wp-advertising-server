import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { normalizeDomain, normalizeSiteUrl } from '../lib/urlUtils.js';
import { rotationCache } from './rotationCache.js';
import { getStripe } from './stripeClient.js';

export async function claimStripeEvent(id: string, type: string): Promise<boolean> {
  try {
    await prisma.stripeEvent.create({ data: { id, type } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

export async function releaseStripeEvent(id: string) {
  await prisma.stripeEvent.delete({ where: { id } }).catch(() => undefined);
}

export async function activateProEntitlement(input: {
  siteUrl: string;
  customerEmail?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  accessUntil: Date;
}) {
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const siteDomain = normalizeDomain(new URL(siteUrl).hostname);
  const now = new Date();

  let site = await prisma.communitySite.findFirst({
    where: { OR: [{ siteUrl }, { siteDomain }] },
  });

  if (!site) {
    site = await prisma.communitySite.create({
      data: {
        siteUrl,
        siteDomain,
        publicKey: `pub_${nanoid(32)}`,
        networkStatus: 'ACTIVE',
        networkAccessUntil: input.accessUntil,
        lastSeenAt: now,
      },
    });
  } else {
    site = await prisma.communitySite.update({
      where: { id: site.id },
      data: {
        networkStatus: 'ACTIVE',
        networkAccessUntil: input.accessUntil,
        lastSeenAt: now,
      },
    });
  }

  let license = input.stripeSubscriptionId
    ? await prisma.license.findFirst({ where: { stripeSubscriptionId: input.stripeSubscriptionId } })
    : null;

  if (license) {
    license = await prisma.license.update({
      where: { id: license.id },
      data: {
        status: 'ACTIVE',
        expiresAt: input.accessUntil,
        customerEmail: input.customerEmail ?? license.customerEmail,
        stripeCustomerId: input.stripeCustomerId ?? license.stripeCustomerId,
      },
    });
  } else {
    license = await prisma.license.create({
      data: {
        licenseKey: `lic_${nanoid(32)}`,
        status: 'ACTIVE',
        expiresAt: input.accessUntil,
        customerEmail: input.customerEmail ?? undefined,
        stripeCustomerId: input.stripeCustomerId ?? undefined,
        stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
      },
    });
  }

  await prisma.licenseActivation.upsert({
    where: { licenseId_siteId: { licenseId: license.id, siteId: site.id } },
    create: {
      licenseId: license.id,
      siteId: site.id,
      domainSnapshot: siteDomain,
      lastValidatedAt: now,
    },
    update: {
      deactivatedAt: null,
      domainSnapshot: siteDomain,
      lastValidatedAt: now,
    },
  });

  await rotationCache.invalidate();
  return { site, license };
}

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
