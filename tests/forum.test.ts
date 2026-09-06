import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

const { p, rc } = vi.hoisted(() => {
  const p = {
    communitySite: { findUnique: vi.fn() },
    communityMembership: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    communityPost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    communityComment: { create: vi.fn() },
  };
  const rc = { invalidate: vi.fn() };
  return { p, rc };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));

import { createApp } from '../src/app.js';

const app = createApp();

const site = {
  id: 'site_forum',
  publicKey: 'pub_forum_key_1234567890abcdef',
  status: 'ACTIVE',
  networkStatus: 'TRIAL',
  networkAccessUntil: new Date(Date.now() + 86400000),
  siteDomain: 'forum.example.com',
};

describe('community forum API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists posts publicly', async () => {
    p.communityPost.findMany.mockResolvedValue([
      {
        id: 'p1',
        title: 'Hello',
        slug: 'hello',
        type: 'DISCUSSION',
        category: null,
        isPinned: true,
        isLocked: false,
        createdAt: new Date(),
        author: { displayName: 'Team', role: 'ADMIN' },
        _count: { comments: 0 },
      },
    ]);

    const res = await request(app).get('/v1/forum/posts');
    expect(res.status).toBe(200);
    expect(res.body.posts[0].slug).toBe('hello');
  });

  it('creates a post for an entitled member', async () => {
    p.communitySite.findUnique.mockResolvedValue(site);
    p.communityMembership.findUnique.mockResolvedValue({
      id: 'mem_1',
      siteId: site.id,
      canPost: true,
      role: 'MEMBER',
      displayName: 'Publisher',
    });
    p.communityPost.create.mockResolvedValue({
      id: 'p2',
      slug: 'new-topic-abc123',
      title: 'New topic',
    });

    const res = await request(app).post('/v1/forum/posts').send({
      siteId: site.id,
      apiKey: site.publicKey,
      title: 'New topic',
      body: 'Body of the discussion post.',
    });

    expect(res.status).toBe(201);
    expect(res.body.post.slug).toContain('new-topic');
  });

  it('rejects posting without active entitlement', async () => {
    p.communitySite.findUnique.mockResolvedValue({
      ...site,
      networkStatus: 'EXPIRED',
      networkAccessUntil: new Date(Date.now() - 1000),
    });
    p.communityMembership.findUnique.mockResolvedValue({
      id: 'mem_1',
      siteId: site.id,
      canPost: true,
      role: 'MEMBER',
    });

    const res = await request(app).post('/v1/forum/posts').send({
      siteId: site.id,
      apiKey: site.publicKey,
      title: 'Nope',
      body: 'Should fail for expired.',
    });

    expect(res.status).toBe(403);
  });
});
