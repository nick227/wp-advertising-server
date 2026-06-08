import { z } from 'zod';
import { authenticateSite, authSiteSchema } from './siteService.js';
import { prisma } from '../lib/prisma.js';
import { publicHttpUrlSchema, domainFromUrl, normalizeAdUrl } from '../lib/urlUtils.js';
import { forbidden } from '../lib/errors.js';
import { rotationCache } from './rotationCache.js';

export const upsertAdSchema = authSiteSchema.extend({
  title: z.string().trim().min(1).max(160),
  imageUrl: publicHttpUrlSchema,
  targetUrl: publicHttpUrlSchema,
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  weight: z.number().int().min(1).max(10).optional(),
});

export async function upsertSiteAd(input: z.infer<typeof upsertAdSchema>) {
  await authenticateSite(input);
  const imageUrl = normalizeAdUrl(input.imageUrl);
  const targetUrl = normalizeAdUrl(input.targetUrl);
  await assertDomainAllowed(imageUrl);
  await assertDomainAllowed(targetUrl);

  const existing = await prisma.communityAd.findFirst({
    where: { siteId: input.siteId },
    orderBy: { createdAt: 'asc' },
  });

  const data = {
    title: input.title,
    imageUrl,
    targetUrl,
    status: input.status ?? 'ACTIVE',
    weight: input.weight ?? 1,
  } as const;

  const result = existing
    ? await prisma.communityAd.update({ where: { id: existing.id }, data, select: adSelect })
    : await prisma.communityAd.create({ data: { ...data, siteId: input.siteId }, select: adSelect });

  await rotationCache.invalidate();
  return result;
}

async function assertDomainAllowed(url: string) {
  const domain = domainFromUrl(url);
  const blocked = await prisma.blockedDomain.findUnique({ where: { domain } });
  if (blocked) throw forbidden('Ad URL domain is blocked');
}

export const adSelect = {
  id: true,
  siteId: true,
  title: true,
  imageUrl: true,
  targetUrl: true,
  status: true,
  weight: true,
  servedCount: true,
  clickCount: true,
  updatedAt: true,
} as const;
