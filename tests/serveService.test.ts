import { vi, describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

// Mock prisma because rotationCache (imported by serveService) transitively imports it.
vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    communityAd: { findMany: vi.fn() },
    communitySite: { findMany: vi.fn() },
  },
}));

import { signEventToken, verifyEventToken } from '../src/services/serveService.js';
import { config } from '../src/config.js';

describe('signEventToken / verifyEventToken', () => {
  it('produces a base64url token with exactly two dot-separated parts', () => {
    const token = signEventToken({ adId: 'ad1', sourceSiteId: 'src', targetSiteId: 'tgt' });
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(10);
    expect(parts[1].length).toBeGreaterThan(10);
  });

  it('returns the original payload fields for a valid token', () => {
    const input = { adId: 'ad_abc', sourceSiteId: 'site_a', targetSiteId: 'site_b', requestId: 'req_x' };
    const token = signEventToken(input);
    const payload = verifyEventToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.adId).toBe(input.adId);
    expect(payload!.sourceSiteId).toBe(input.sourceSiteId);
    expect(payload!.targetSiteId).toBe(input.targetSiteId);
    expect(payload!.requestId).toBe(input.requestId);
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it('returns null for a token that has expired', () => {
    const expiredBody = { adId: 'x', sourceSiteId: 'y', targetSiteId: 'z', exp: Date.now() - 5000 };
    const body = Buffer.from(JSON.stringify(expiredBody)).toString('base64url');
    const sig = crypto.createHmac('sha256', config.eventTokenSecret).update(body).digest('base64url');
    const token = `${body}.${sig}`;

    expect(verifyEventToken(token)).toBeNull();
  });

  it('returns null when the signature has been tampered with', () => {
    const token = signEventToken({ adId: 'ad1', sourceSiteId: 's1', targetSiteId: 's2' });
    const [body] = token.split('.');
    const tamperedToken = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    expect(verifyEventToken(tamperedToken)).toBeNull();
  });

  it('returns null for a token with no dot separator', () => {
    expect(verifyEventToken('nodotinthisstring')).toBeNull();
    expect(verifyEventToken('')).toBeNull();
  });

  it('returns null when adId is missing from the decoded payload', () => {
    const badPayload = { sourceSiteId: 'x', targetSiteId: 'y', exp: Date.now() + 60000 };
    const body = Buffer.from(JSON.stringify(badPayload)).toString('base64url');
    const sig = crypto.createHmac('sha256', config.eventTokenSecret).update(body).digest('base64url');

    expect(verifyEventToken(`${body}.${sig}`)).toBeNull();
  });
});
