import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { hashPassword } from '../src/services/communitySession.js';

const { p } = vi.hoisted(() => {
  const p = {
    communityUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    communityPost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    communityComment: { create: vi.fn() },
  };
  return { p };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: { invalidate: vi.fn() } }));

import { createApp } from '../src/app.js';

const app = createApp();

const user = {
  id: 'user_1',
  email: 'writer@example.com',
  passwordHash: hashPassword('password123'),
  displayName: 'Writer',
  role: 'MEMBER',
  canPost: true,
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

  it('registers a user and creates a post with session cookie', async () => {
    p.communityUser.findUnique.mockResolvedValueOnce(null);
    p.communityUser.create.mockResolvedValue({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: 'MEMBER',
      canPost: true,
      createdAt: new Date(),
    });
    p.communityUser.findUnique.mockResolvedValue(user);
    p.communityPost.create.mockResolvedValue({
      id: 'p2',
      slug: 'new-topic-abc123',
      title: 'New topic',
    });

    const agent = request.agent(app);
    const register = await agent.post('/v1/forum/register').send({
      email: user.email,
      password: 'password123',
      displayName: user.displayName,
    });
    expect(register.status).toBe(201);

    const res = await agent.post('/v1/forum/posts').send({
      title: 'New topic',
      body: 'Body of the discussion post.',
    });

    expect(res.status).toBe(201);
    expect(res.body.post.slug).toContain('new-topic');
  });

  it('rejects posting without a session', async () => {
    const res = await request(app).post('/v1/forum/posts').send({
      title: 'Nope',
      body: 'Should fail without login.',
    });

    expect(res.status).toBe(401);
  });
});
