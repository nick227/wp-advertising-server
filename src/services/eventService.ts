import crypto from 'node:crypto';
import { z } from 'zod';
import type { Request } from 'express';
import { badRequest } from '../lib/errors.js';
import { extractDomain } from '../lib/urlUtils.js';
import { verifyEventToken } from './serveService.js';
import { eventQueue } from './eventQueue.js';

export const eventBodySchema = z.object({
  token: z.string().min(8),
  type: z.enum(['IMPRESSION', 'CLICK']),
  referrer: z.string().optional(),
});

export async function recordEvent(input: z.infer<typeof eventBodySchema>, req?: Request) {
  const payload = verifyEventToken(input.token);
  if (!payload) throw badRequest('Invalid event token');

  const referrer = input.referrer || req?.get('referer') || undefined;
  const referrerDomain = extractDomain(referrer);
  const userAgentHash = req?.get('user-agent') ? hash(req.get('user-agent') || '') : undefined;

  eventQueue.push({
    adId: payload.adId,
    sourceSiteId: payload.sourceSiteId,
    targetSiteId: payload.targetSiteId,
    type: input.type,
    referrerDomain,
    userAgentHash,
    requestId: payload.requestId || req?.requestId,
    createdAt: new Date(),
  });

  return payload;
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
