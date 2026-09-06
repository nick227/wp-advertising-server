import { nanoid } from 'nanoid';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound } from '../lib/errors.js';
import { normalizeDomain, normalizeSiteUrl, publicHttpUrlSchema } from '../lib/urlUtils.js';
import { rotationCache } from './rotationCache.js';
import { requireNetworkEntitlement } from './entitlementService.js';

export const registerSiteSchema = z.object({
  siteUrl: publicHttpUrlSchema,
  siteName: z.string().max(255).optional(),
  pluginVersion: z.string().max(48).optional(),
});

export const authSiteSchema = z.object({
  siteId: z.string().min(1),
  apiKey: z.string().min(8).max(96),
});

export const optInSchema = authSiteSchema.extend({
  optedIn: z.boolean(),
});

export async function registerSite(input: z.infer<typeof registerSiteSchema>) {
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const siteDomain = normalizeDomain(new URL(siteUrl).hostname);

  const blocked = await prisma.blockedDomain.findUnique({ where: { domain: siteDomain } });
  if (blocked) throw forbidden('This domain is blocked from the community network');

  const existing = await prisma.communitySite.findFirst({
    where: { OR: [{ siteUrl }, { siteDomain }] },
  });

  if (existing) {
    const updated = await prisma.communitySite.update({
      where: { id: existing.id },
      data: {
        siteUrl,
        siteDomain,
        siteName: input.siteName ?? existing.siteName,
        pluginVersion: input.pluginVersion ?? existing.pluginVersion,
        lastSeenAt: new Date(),
      },
    });
    await rotationCache.invalidate();
    return {
      siteId: updated.id,
      apiKey: updated.publicKey,
      status: updated.status,
      optedIn: updated.optedIn,
      networkStatus: updated.networkStatus,
      networkAccessUntil: updated.networkAccessUntil?.toISOString() ?? null,
      alreadyRegistered: true,
    };
  }

  const publicKey = `pub_${nanoid(32)}`;

  const site = await prisma.communitySite.create({
    data: {
      siteUrl,
      siteDomain,
      siteName: input.siteName,
      pluginVersion: input.pluginVersion,
      publicKey,
      lastSeenAt: new Date(),
    },
  });

  await rotationCache.invalidate();
  return {
    siteId: site.id,
    apiKey: site.publicKey,
    status: site.status,
    optedIn: site.optedIn,
    networkStatus: site.networkStatus,
    networkAccessUntil: site.networkAccessUntil?.toISOString() ?? null,
    alreadyRegistered: false,
  };
}

export async function authenticateSite(input: z.infer<typeof authSiteSchema>) {
  const site = await prisma.communitySite.findUnique({ where: { id: input.siteId } });
  if (!site) throw notFound('Community site not found');
  if (site.publicKey !== input.apiKey) throw forbidden('Invalid site credentials');
  if (site.status === 'BLOCKED') throw forbidden('Community site is blocked');
  return site;
}

export async function heartbeat(input: z.infer<typeof authSiteSchema>) {
  await authenticateSite(input);
  return prisma.communitySite.update({
    where: { id: input.siteId },
    data: { lastSeenAt: new Date() },
    select: {
      id: true,
      status: true,
      optedIn: true,
      lastSeenAt: true,
      networkStatus: true,
      networkAccessUntil: true,
    },
  });
}

export async function setOptIn(input: z.infer<typeof optInSchema>) {
  await authenticateSite(input);
  if (input.optedIn) {
    await requireNetworkEntitlement(input.siteId);
  }
  const site = await prisma.communitySite.update({
    where: { id: input.siteId },
    data: { optedIn: input.optedIn, lastSeenAt: new Date() },
    select: {
      id: true,
      status: true,
      optedIn: true,
      updatedAt: true,
      networkStatus: true,
      networkAccessUntil: true,
    },
  });
  await rotationCache.invalidate();
  return site;
}
