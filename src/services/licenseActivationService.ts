import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound } from '../lib/errors.js';
import { rotationCache } from './rotationCache.js';
import {
  entitlementAuthSchema,
  entitlementPayload,
  authenticateForEntitlement,
} from './entitlementService.js';

export const activateLicenseSchema = entitlementAuthSchema.extend({
  licenseKey: z.string().trim().min(8).max(96),
  pluginVersion: z.string().max(48).optional(),
});

export async function activateLicense(input: z.infer<typeof activateLicenseSchema>) {
  const site = await authenticateForEntitlement(input);
  const licenseKey = input.licenseKey.trim();
  const license = await prisma.license.findUnique({ where: { licenseKey } });
  if (!license) throw notFound('License not found');
  if (license.status !== 'ACTIVE') throw forbidden('License is not active');
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    throw forbidden('License has expired');
  }

  const existing = await prisma.licenseActivation.findUnique({
    where: { licenseId_siteId: { licenseId: license.id, siteId: site.id } },
  });

  if (!existing || existing.deactivatedAt) {
    const activeCount = await prisma.licenseActivation.count({
      where: { licenseId: license.id, deactivatedAt: null },
    });
    if (activeCount >= license.maxActivations) {
      throw forbidden('License activation limit reached');
    }
  }

  const now = new Date();
  const accessUntil = license.expiresAt ?? new Date(now.getTime() + 365 * 86400000);

  await prisma.licenseActivation.upsert({
    where: { licenseId_siteId: { licenseId: license.id, siteId: site.id } },
    create: {
      licenseId: license.id,
      siteId: site.id,
      domainSnapshot: site.siteDomain,
      pluginVersion: input.pluginVersion,
      lastValidatedAt: now,
    },
    update: {
      deactivatedAt: null,
      domainSnapshot: site.siteDomain,
      pluginVersion: input.pluginVersion ?? undefined,
      lastValidatedAt: now,
    },
  });

  const updated = await prisma.communitySite.update({
    where: { id: site.id },
    data: {
      networkStatus: 'ACTIVE',
      networkAccessUntil: accessUntil,
      lastSeenAt: now,
    },
  });

  await rotationCache.invalidate();
  return {
    ...entitlementPayload(updated, now),
    licenseKey: license.licenseKey,
    licenseStatus: license.status,
  };
}
