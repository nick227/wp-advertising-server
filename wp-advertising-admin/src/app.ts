import { installDevReload } from './devReload.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { adFetch, AdServerError } from './adClient.js';
import { clearSession, readSessionToken, requireSession, setSession } from './auth.js';
import { renderLogin, renderPage } from './layout.js';
import {
  adsBody,
  communityAdminBody,
  licensesBody,
  overviewBody,
  siteDetailBody,
  sitesBody,
  systemBody,
} from './pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../public/assets');

function flash(res: express.Response, message: string) {
  res.cookie('wpa_flash', message, { httpOnly: true, maxAge: 30_000, sameSite: 'lax', path: '/' });
}

function takeFlash(req: express.Request, res: express.Response): string | undefined {
  const value = req.cookies?.wpa_flash;
  if (value) res.clearCookie('wpa_flash', { path: '/' });
  return typeof value === 'string' ? value : undefined;
}

function handleAdError(res: express.Response, error: unknown, fallbackPath: string) {
  if (error instanceof AdServerError && error.status === 401) {
    clearSession(res);
    res.redirect('/login');
    return;
  }
  const message = error instanceof AdServerError
    ? `Ad server error ${error.status}`
    : 'Request failed';
  flash(res, message);
  res.redirect(fallbackPath);
}

function q(req: express.Request, key: string) {
  const value = req.query[key];
  return typeof value === 'string' ? value : '';
}

export function createApp() {
  const app = express();
  installDevReload(app, assetsDir);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));
  app.use('/assets', express.static(assetsDir, { maxAge: process.env.WPA_DEV_RELOAD === '1' && process.env.NODE_ENV !== 'production' ? 0 : '1h' }));

  app.get('/login', (req, res) => {
    if (readSessionToken(req)) {
      res.redirect('/');
      return;
    }
    res.type('html').send(renderLogin());
  });

  app.post('/login', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).type('html').send(renderLogin('Token required'));
      return;
    }
    try {
      await adFetch(token, '/admin/metrics');
      setSession(res, token);
      res.redirect('/');
    } catch {
      res.status(401).type('html').send(renderLogin('Invalid token or ad server unreachable'));
    }
  });

  app.post('/logout', (_req, res) => {
    clearSession(res);
    res.redirect('/login');
  });

  app.use(requireSession);

  app.get('/', async (req, res) => {
    try {
      const data = await adFetch(req.adminToken!, '/admin/overview');
      res.type('html').send(renderPage('Overview', overviewBody(data as never), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/login');
    }
  });

  app.get('/sites', async (req, res) => {
    try {
      const filters = { q: q(req, 'q'), networkStatus: q(req, 'networkStatus'), optedIn: q(req, 'optedIn') };
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.networkStatus && filters.networkStatus !== 'ALL') params.set('networkStatus', filters.networkStatus);
      if (filters.optedIn) params.set('optedIn', filters.optedIn);
      const path = `/admin/sites${params.toString() ? `?${params}` : ''}`;
      const data = await adFetch<{ sites: never[] }>(req.adminToken!, path);
      res.type('html').send(renderPage('Sites', sitesBody(data.sites, filters), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/sites');
    }
  });

  app.get('/sites/:siteId', async (req, res) => {
    try {
      const data = await adFetch<{ site: never }>(
        req.adminToken!,
        `/admin/sites/${encodeURIComponent(req.params.siteId)}`,
      );
      res.type('html').send(renderPage('Site', siteDetailBody(data.site as never), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/sites');
    }
  });

  for (const action of ['extend-trial', 'grant-pro', 'suspend', 'revoke', 'opt-out', 'reset-activation'] as const) {
    app.post(`/sites/:siteId/${action}`, async (req, res) => {
      const detail = `/sites/${encodeURIComponent(req.params.siteId)}`;
      try {
        const body = action === 'extend-trial' || action === 'grant-pro' ? JSON.stringify({ days: 30 }) : undefined;
        await adFetch(req.adminToken!, `/admin/sites/${encodeURIComponent(req.params.siteId)}/${action}`, {
          method: 'POST',
          body,
        });
        flash(res, `OK: ${action}`);
        res.redirect(detail);
      } catch (error) {
        handleAdError(res, error, detail);
      }
    });
  }

  app.get('/ads', async (req, res) => {
    try {
      const filters = { q: q(req, 'q'), status: q(req, 'status') };
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
      const path = `/admin/ads${params.toString() ? `?${params}` : ''}`;
      const data = await adFetch<{ ads: never[] }>(req.adminToken!, path);
      res.type('html').send(renderPage('Ads', adsBody(data.ads, filters), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/ads');
    }
  });

  app.post('/ads/:adId/status', async (req, res) => {
    try {
      await adFetch(req.adminToken!, `/admin/ads/${encodeURIComponent(req.params.adId)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: String(req.body?.status || 'PAUSED') }),
      });
      flash(res, 'Ad status updated');
      res.redirect('/ads');
    } catch (error) {
      handleAdError(res, error, '/ads');
    }
  });

  app.get('/licenses', async (req, res) => {
    try {
      const filters = { q: q(req, 'q') };
      const path = filters.q ? `/admin/licenses?q=${encodeURIComponent(filters.q)}` : '/admin/licenses';
      const data = await adFetch<{ licenses: never[] }>(req.adminToken!, path);
      res.type('html').send(renderPage('Licenses', licensesBody(data.licenses, filters), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/licenses');
    }
  });

  app.get('/community', async (req, res) => {
    try {
      const data = await adFetch<{ posts: never[]; members: never[] }>(req.adminToken!, '/admin/forum');
      res.type('html').send(renderPage('Community', communityAdminBody(data as never), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/community');
    }
  });

  app.post('/community/seed', async (req, res) => {
    try {
      await adFetch(req.adminToken!, '/admin/forum/seed', { method: 'POST' });
      flash(res, 'Forum seed checked');
      res.redirect('/community');
    } catch (error) {
      handleAdError(res, error, '/community');
    }
  });

  app.post('/community/posts/:postId/moderate', async (req, res) => {
    try {
      const body: { isPinned?: boolean; isLocked?: boolean } = {};
      if (req.body?.isPinned !== undefined) body.isPinned = String(req.body.isPinned) === '1';
      if (req.body?.isLocked !== undefined) body.isLocked = String(req.body.isLocked) === '1';
      await adFetch(req.adminToken!, `/admin/forum/posts/${encodeURIComponent(req.params.postId)}/moderate`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      flash(res, 'Post updated');
      res.redirect('/community');
    } catch (error) {
      handleAdError(res, error, '/community');
    }
  });

  app.post('/community/posts/:postId/delete', async (req, res) => {
    try {
      await adFetch(req.adminToken!, `/admin/forum/posts/${encodeURIComponent(req.params.postId)}/delete`, {
        method: 'POST',
      });
      flash(res, 'Post deleted');
      res.redirect('/community');
    } catch (error) {
      handleAdError(res, error, '/community');
    }
  });

  app.post('/community/members/:membershipId/can-post', async (req, res) => {
    try {
      await adFetch(req.adminToken!, `/admin/forum/members/${encodeURIComponent(req.params.membershipId)}/can-post`, {
        method: 'POST',
        body: JSON.stringify({ canPost: String(req.body?.canPost) === '1' }),
      });
      flash(res, 'Membership updated');
      res.redirect('/community');
    } catch (error) {
      handleAdError(res, error, '/community');
    }
  });

  app.get('/system', async (req, res) => {
    try {
      const data = await adFetch(req.adminToken!, '/admin/metrics');
      res.type('html').send(renderPage('System', systemBody(data as never), takeFlash(req, res)));
    } catch (error) {
      handleAdError(res, error, '/system');
    }
  });

  app.post('/system/rebuild-cache', async (req, res) => {
    try {
      await adFetch(req.adminToken!, '/admin/cache/rebuild', { method: 'POST' });
      flash(res, 'Cache rebuild requested');
      res.redirect('/system');
    } catch (error) {
      handleAdError(res, error, '/system');
    }
  });

  app.post('/system/flush-events', async (req, res) => {
    try {
      await adFetch(req.adminToken!, '/admin/events/flush', { method: 'POST' });
      flash(res, 'Event queue flush requested');
      res.redirect('/system');
    } catch (error) {
      handleAdError(res, error, '/system');
    }
  });

  app.post('/system/soft-launch-seed', async (req, res) => {
    try {
      await adFetch(req.adminToken!, '/admin/soft-launch/seed', { method: 'POST' });
      flash(res, 'Soft-launch inventory seeded');
      res.redirect('/system');
    } catch (error) {
      handleAdError(res, error, '/system');
    }
  });

  return app;
}
