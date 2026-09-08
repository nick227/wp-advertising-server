import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { rotationCache } from './rotationCache.js';
import { getBillingConfig } from './billingConfigService.js';

export const siteActionSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const adStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'BLOCKED', 'PENDING', 'REJECTED']),
});

const siteSelect = {
  id: true,
  siteUrl: true,
  siteDomain: true,
  siteName: true,
  status: true,
  optedIn: true,
  pluginVersion: true,
  lastSeenAt: true,
  networkStatus: true,
  networkTrialStartedAt: true,
  networkAccessUntil: true,
  updatedAt: true,
} as const;

export async function extendTrial(siteId: string, days?: number) {
  const site = await requireSite(siteId);
  const now = new Date();
  days = days ?? (await getBillingConfig()).trialDays;
  if (!days) throw badRequest('Trials are disabled; specify an explicit extension');
  const base = site.networkAccessUntil && site.networkAccessUntil > now
    ? site.networkAccessUntil
    : now;
  const accessUntil = new Date(base.getTime() + days * 86400000);
  const updated = await prisma.communitySite.update({
    where: { id: siteId },
    data: {
      networkStatus: site.networkStatus === 'ACTIVE' ? 'ACTIVE' : 'TRIAL',
      networkTrialStartedAt: site.networkTrialStartedAt ?? now,
      networkAccessUntil: accessUntil,
    },
    select: siteSelect,
  });
  await rotationCache.invalidate();
  return updated;
}

export async function grantPro(siteId: string, days: number) {
  if (!days) throw badRequest('days is required to grant Pro');
  const site = await requireSite(siteId);
  const now = new Date();
  const accessUntil = new Date(now.getTime() + days * 86400000);
  const updated = await prisma.communitySite.update({
    where: { id: siteId },
    data: {
      networkStatus: 'ACTIVE',
      networkAccessUntil: accessUntil,
      networkTrialStartedAt: site.networkTrialStartedAt ?? now,
    },
    select: siteSelect,
  });
  await rotationCache.invalidate();
  return updated;
}

export async function suspendSite(siteId: string) {
  await requireSite(siteId);
  const updated = await prisma.communitySite.update({
    where: { id: siteId },
    data: { networkStatus: 'SUSPENDED', optedIn: false },
    select: siteSelect,
  });
  await rotationCache.invalidate();
  return updated;
}

export async function revokeSite(siteId: string) {
  await requireSite(siteId);
  const updated = await prisma.communitySite.update({
    where: { id: siteId },
    data: { networkStatus: 'REVOKED', optedIn: false, networkAccessUntil: new Date() },
    select: siteSelect,
  });
  await rotationCache.invalidate();
  return updated;
}

export async function forceOptOut(siteId: string) {
  await requireSite(siteId);
  const updated = await prisma.communitySite.update({
    where: { id: siteId },
    data: { optedIn: false },
    select: siteSelect,
  });
  await rotationCache.invalidate();
  return updated;
}

export async function resetActivations(siteId: string) {
  await requireSite(siteId);
  const result = await prisma.licenseActivation.updateMany({
    where: { siteId, deactivatedAt: null },
    data: { deactivatedAt: new Date() },
  });
  return { siteId, deactivated: result.count };
}

export async function setAdStatus(adId: string, status: z.infer<typeof adStatusSchema>['status']) {
  const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
  if (!ad) throw notFound('Ad not found');
  const updated = await prisma.communityAd.update({
    where: { id: adId },
    data: { status },
  });
  await rotationCache.invalidate();
  return updated;
}

async function requireSite(siteId: string) {
  const site = await prisma.communitySite.findUnique({ where: { id: siteId } });
  if (!site) throw notFound('Community site not found');
  return site;
}
