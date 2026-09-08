import { getBillingConfig } from './billingConfigService.js';
import type { CommunitySite, NetworkStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound } from '../lib/errors.js';
import { rotationCache } from './rotationCache.js';

export const ENTITLEMENT_SWEEP_MS = 10 * 60 * 1000;

export const entitlementAuthSchema = z.object({
  siteId: z.string().min(1),
  apiKey: z.string().min(8).max(96),
});

export const FREE_RULES = {
  community_network: false,
  external_embeds: false,
  woocommerce_ads: false,
  csv_export: false,
  max_ads: 5,
  advanced_analytics: false,
} as const;

export const PRO_RULES = {
  community_network: true,
  external_embeds: true,
  woocommerce_ads: true,
  csv_export: true,
  max_ads: 50,
  advanced_analytics: true,
} as const;

export type EntitlementRules = typeof FREE_RULES | typeof PRO_RULES;

export async function authenticateForEntitlement(input: z.infer<typeof entitlementAuthSchema>) {
  const site = await prisma.communitySite.findUnique({ where: { id: input.siteId } });
  if (!site) throw notFound('Community site not found');
  if (site.publicKey !== input.apiKey) throw forbidden('Invalid site credentials');
  if (site.status === 'BLOCKED') throw forbidden('Community site is blocked');
  return site;
}

export function isNetworkStatusEligible(status: NetworkStatus | null | undefined): boolean {
  return status === 'TRIAL' || status === 'ACTIVE';
}

export function hasValidAccessWindow(accessUntil: Date | null | undefined, now = new Date()): boolean {
  if (!accessUntil) return false;
  return accessUntil.getTime() > now.getTime();
}

export function isSiteNetworkEligible(
  site: Pick<CommunitySite, 'status' | 'networkStatus' | 'networkAccessUntil'>,
  now = new Date(),
): boolean {
  if (site.status !== 'ACTIVE') return false;
  if (!isNetworkStatusEligible(site.networkStatus)) return false;
  return hasValidAccessWindow(site.networkAccessUntil, now);
}

export function rulesForSite(
  site: Pick<CommunitySite, 'networkStatus' | 'networkAccessUntil'>,
  now = new Date(),
): EntitlementRules {
  if (!isNetworkStatusEligible(site.networkStatus) || !hasValidAccessWindow(site.networkAccessUntil, now)) {
    return FREE_RULES;
  }
  return PRO_RULES;
}

export function entitlementPayload(site: CommunitySite, now = new Date()) {
  return {
    siteId: site.id,
    networkStatus: site.networkStatus,
    networkTrialStartedAt: site.networkTrialStartedAt?.toISOString() ?? null,
    networkAccessUntil: site.networkAccessUntil?.toISOString() ?? null,
    eligible: isSiteNetworkEligible(site, now),
    rules: rulesForSite(site, now),
    nextCheckSuggestedSec: 60 * 60,
  };
}

async function markExpiredIfNeeded(site: CommunitySite, now = new Date()): Promise<CommunitySite> {
  if (!isNetworkStatusEligible(site.networkStatus)) return site;
  if (hasValidAccessWindow(site.networkAccessUntil, now)) return site;

  return prisma.communitySite.update({
    where: { id: site.id },
    data: {
      networkStatus: 'EXPIRED',
    },
  });
}

export async function startTrial(input: z.infer<typeof entitlementAuthSchema>) {
  let site = await authenticateForEntitlement(input);
  const now = new Date();
  site = await markExpiredIfNeeded(site, now);

  if (site.networkStatus === 'SUSPENDED' || site.networkStatus === 'REVOKED') {
    throw forbidden('Network access is suspended or revoked for this site');
  }

  if (isSiteNetworkEligible(site, now)) {
    return entitlementPayload(site, now);
  }

  if (site.networkTrialStartedAt) {
    throw forbidden('Trial already used for this site. Activate Pro to continue network access.');
  }

  const { trialDays } = await getBillingConfig();
  if (!trialDays) throw forbidden('New trials are currently disabled');
  const accessUntil = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const updated = await prisma.communitySite.update({
    where: { id: site.id },
    data: {
      networkStatus: 'TRIAL',
      networkTrialStartedAt: now,
      networkAccessUntil: accessUntil,
      lastSeenAt: now,
    },
  });
  await rotationCache.invalidate();
  return entitlementPayload(updated, now);
}

export async function validateEntitlement(input: z.infer<typeof entitlementAuthSchema>) {
  let site = await authenticateForEntitlement(input);
  const now = new Date();
  site = await markExpiredIfNeeded(site, now);

  const data: { lastSeenAt: Date; optedIn?: boolean } = { lastSeenAt: now };
  if (site.networkStatus === 'EXPIRED' && site.optedIn) {
    data.optedIn = false;
  }
  site = await prisma.communitySite.update({
    where: { id: site.id },
    data,
  });
  if (data.optedIn === false) {
    await rotationCache.invalidate();
  }
  return entitlementPayload(site, now);
}

export async function requireNetworkEntitlement(siteId: string) {
  const site = await prisma.communitySite.findUnique({ where: { id: siteId } });
  if (!site) throw forbidden('Community site not found');
  const current = await markExpiredIfNeeded(site, new Date());
  if (!isSiteNetworkEligible(current)) {
    throw forbidden('Active Trial or Pro entitlement is required for community network access');
  }
  return current;
}

export async function expireDueEntitlements() {
  const now = new Date();
  const result = await prisma.communitySite.updateMany({
    where: {
      networkStatus: { in: ['TRIAL', 'ACTIVE'] },
      networkAccessUntil: { lte: now },
    },
    data: {
      networkStatus: 'EXPIRED',
    },
  });
  if (result.count > 0) {
    await rotationCache.invalidate();
  }
  return result;
}

let sweepTimer: NodeJS.Timeout | undefined;

export const entitlementSweeper = {
  start() {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
      void expireDueEntitlements().catch((error) => {
        console.error('entitlement sweep failed', error);
      });
    }, ENTITLEMENT_SWEEP_MS);
    sweepTimer.unref();
  },
  stop() {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = undefined;
  },
};
