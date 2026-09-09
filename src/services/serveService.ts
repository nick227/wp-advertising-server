import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { normalizeSiteUrl, normalizeDomain, publicHttpUrlSchema } from '../lib/urlUtils.js';
import { rotationCache } from './rotationCache.js';
import { eventQueue } from './eventQueue.js';

export const serveQuerySchema = z.object({
  siteUrl: publicHttpUrlSchema,
  zone: z.string().max(80).optional(),
  tracking: z.enum(['0', '1']).optional(),
});

export type ServeResponse = {
  adId: string;
  siteId: string;
  title: string;
  imageUrl: string;
  targetUrl: string;
  network: {
    servedBy: 'community';
    algorithm: 'cached-round-robin';
    requestId: string;
    cacheVersion: number;
  };
};

export async function serveCommunityAd(input: z.infer<typeof serveQuerySchema>, requestId: string): Promise<ServeResponse | null> {
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const siteDomain = normalizeDomain(new URL(siteUrl).hostname);
  const snapshot = await rotationCache.getSnapshot();
  const sourceSite = snapshot.siteByDomain.get(siteDomain);

  if (!sourceSite || !sourceSite.optedIn || sourceSite.status !== 'ACTIVE') return null;
  if (sourceSite.networkStatus !== 'TRIAL' && sourceSite.networkStatus !== 'ACTIVE') return null;
  if (!sourceSite.networkAccessUntil || sourceSite.networkAccessUntil <= Date.now()) return null;

  const ad = rotationCache.nextAd(sourceSite.id, siteDomain);
  if (!ad) return null;

  // Delivery/impression signal is the serve itself — never emit browser→Railway tracking URLs.
  if (config.eventTrackingEnabled && input.tracking !== '0') {
    eventQueue.push({
      adId: ad.adId,
      sourceSiteId: sourceSite.id,
      targetSiteId: ad.siteId,
      type: 'IMPRESSION',
      requestId,
      createdAt: new Date(),
    });
  }

  return {
    adId: ad.adId,
    siteId: ad.siteId,
    title: ad.title,
    imageUrl: ad.imageUrl,
    targetUrl: ad.targetUrl,
    network: {
      servedBy: 'community',
      algorithm: 'cached-round-robin',
      requestId,
      cacheVersion: snapshot.version,
    },
  };
}

export function signEventToken(payload: { adId: string; sourceSiteId: string; targetSiteId: string; requestId?: string }) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.eventTokenSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyEventToken(token: string) {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', config.eventTokenSecret).update(body).digest('base64url');
    const actual = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      adId: string;
      sourceSiteId: string;
      targetSiteId: string;
      requestId?: string;
      exp: number;
    };
    if (!payload.adId || !payload.sourceSiteId || !payload.targetSiteId) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
