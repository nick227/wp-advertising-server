// NOTE: This rate limiter is in-memory and scoped to a single process.
// It is not shared across replicas. Run as a single replica or replace
// with a distributed store (e.g. Redis) before scaling horizontally.
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { extractDomain } from '../lib/urlUtils.js';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let limitedCount = 0;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, Math.max(config.rateLimitWindowMs, 30000)).unref();

export function rateLimit(name: string, max: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${clientKey(req)}`;
    const now = Date.now();
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + config.rateLimitWindowMs };

    if (!existing && buckets.size >= config.rateLimitMaxBuckets) {
      limitedCount += 1;
      res.setHeader('Retry-After', String(Math.ceil(config.rateLimitWindowMs / 1000)));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', requestId: req.requestId } });
      return;
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      limitedCount += 1;
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', requestId: req.requestId } });
      return;
    }
    next();
  };
}

export function rateLimitStatus() {
  return { buckets: buckets.size, limitedCount, windowMs: config.rateLimitWindowMs };
}

function clientKey(req: Request) {
  const siteUrl = typeof req.query.siteUrl === 'string' ? req.query.siteUrl : undefined;
  const bodySiteUrl = typeof req.body?.siteUrl === 'string' ? req.body.siteUrl : undefined;
  const siteDomain = extractDomain(siteUrl || bodySiteUrl);
  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return siteDomain || forwarded || req.ip || 'unknown';
}
