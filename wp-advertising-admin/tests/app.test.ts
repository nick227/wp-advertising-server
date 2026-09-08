import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { signToken } from '../src/auth.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { createApp } from '../src/app.js';

const app = createApp();
const TOKEN = 'local-admin-token-for-dev-testing-32ch';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function sessionCookie(token = TOKEN) {
  return `wpa_admin_session=${signToken(token)}`;
}

describe('admin BFF', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('GET /login returns login form', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Admin token');
  });

  it('redirects unauthenticated / to /login', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('rejects login when ad server rejects token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    const res = await request(app).post('/login').type('form').send({ token: 'bad' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid token');
  });

  it('accepts login when /admin/metrics succeeds', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const res = await request(app).post('/login').type('form').send({ token: TOKEN });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(res.headers['set-cookie']?.join(';')).toContain('wpa_admin_session=');
  });

  it('renders Overview with soft-launch readiness', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      counts: { sites: 8, optedIn: 8, ads: 8, activeLicenses: 0, serves: 0, clicks: 0, ctr: 0 },
      networkStatus: { TRIAL: 3, ACTIVE: 5 },
      topAds: [],
      recentSites: [],
      softLaunch: {
        ready: false,
        checks: { database: true, eligibleSites: true, rotationAds: false, forumSeeded: true },
        counts: { eligibleSites: 8, rotationAds: 0, forumPosts: 7, seedSites: 8, activeAds: 8 },
      },
      rotation: { items: 0, sites: 0 },
      events: { size: 0, dropped: 0 },
    }));

    const res = await request(app).get('/').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Soft-launch readiness');
    expect(res.text).toContain('Overview');
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/admin/overview');
  });

  it('renders Community moderation page', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      posts: [{
        id: 'p1',
        title: 'How inventory works',
        slug: 'how-inventory-works',
        isPinned: true,
        isLocked: false,
        author: { displayName: 'WP Advertising Team' },
        _count: { comments: 0 },
      }],
      members: [],
    }));

    const res = await request(app).get('/community').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Community');
    expect(res.text).toContain('How inventory works');
  });

  it('renders System page with rebuild actions', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      rotation: { items: 8 },
      events: { size: 0 },
      rateLimits: {},
    }));

    const res = await request(app).get('/system').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Rebuild rotation cache');
  });
});
