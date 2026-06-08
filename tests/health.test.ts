import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc, eq } = vi.hoisted(() => {
  const p = { $queryRaw: vi.fn() };
  const rc = {
    status: vi.fn().mockReturnValue({
      version: 0, items: 0, sites: 0, lastBuiltAt: null,
      lastBuildMs: null, lastError: null, ttlMs: 30000, cursor: 0, loading: false,
    }),
  };
  const eq = { status: vi.fn().mockReturnValue({ size: 0, flushing: false, dropped: 0 }) };
  return { p, rc, eq };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));
vi.mock('../src/services/eventQueue.js', () => ({ eventQueue: eq }));

import { createApp } from '../src/app.js';

const app = createApp();
const ADMIN = 'Bearer test-admin-token-static-value-for-ci';

describe('GET /v1/health', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with db:ok when database is reachable', async () => {
    p.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe('ok');
    expect(res.body.service).toBe('wp-ad-community-service');
    expect(res.body.requestId).toBeDefined();
  });

  it('returns 503 with db:unavailable when database throws', async () => {
    p.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.db).toBe('unavailable');
  });
});

describe('GET /v1/metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without admin token', async () => {
    const res = await request(app).get('/v1/metrics');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with metrics payload for valid admin token', async () => {
    const res = await request(app).get('/v1/metrics').set('authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rotation).toBeDefined();
    expect(res.body.events).toBeDefined();
    expect(res.body.rateLimits).toBeDefined();
  });
});
