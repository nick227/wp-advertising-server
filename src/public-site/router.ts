import { getBillingConfig } from '../services/billingConfigService.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router, type RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isStripeCheckoutConfigured, config } from '../config.js';
import { lookupLicenseForCheckoutSession } from '../services/billingService.js';
import { checkoutSessionSchema, createCheckoutSession } from '../services/checkoutService.js';
import { requireStripeCheckout } from '../services/stripeClient.js';
import {
  createCommentSchema,
  createForumComment,
  createForumPost,
  createPostSchema,
  getForumPost,
  listForumPosts,
} from '../services/forumService.js';
import {
  getCommunityUserById,
  loginCommunityUser,
  loginSchema,
  registerCommunityUser,
  registerSchema,
} from '../services/communityAuthService.js';
import {
  clearSessionCookie,
  createSessionToken,
  readSessionCookie,
  setSessionCookie,
  verifySessionToken,
} from '../services/communitySession.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  communityForumIndex,
  communityForumPost,
  communityLoginPage,
  communityRegisterPage,
} from './communityForum.js';
import { getPublicStatus } from '../services/publicStatusService.js';
import { renderPage, type NavUser } from './layout.js';
import {
  checkoutPage,
  checkoutSuccessPage,
  contactPage,
  homePage,
  legalPage,
  profilePage,
  statusPage,
} from './pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const publicSiteAssetsDir = path.resolve(__dirname, '../../public-site/assets');

const devReload = process.env.WPA_DEV_RELOAD === '1' && process.env.NODE_ENV !== 'production';
const CACHE_CONTROL = devReload ? 'no-store' : 'public, max-age=300';

function formErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message || 'Invalid form input';
  return 'Something went wrong';
}

function html(meta: { title: string; description: string; path: string }, body: string | (() => Promise<string>)): RequestHandler {
  return async (req, res, next) => {
    try {
      const [resolvedBody, user] = await Promise.all([
        typeof body === 'function' ? body() : Promise.resolve(body),
        currentUser(req),
      ]);
      res.setHeader('Cache-Control', typeof body === 'function' || user ? 'no-store' : CACHE_CONTROL);
      res.type('html').send(renderPage(meta, resolvedBody, user));
    } catch (error) { next(error); }
  };
}

function redirectHome(): RequestHandler {
  return (_req, res) => {
    res.redirect(302, '/');
  };
}

async function currentUser(req: express.Request): Promise<NavUser | null> {
  const token = readSessionCookie(req);
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = await getCommunityUserById(session.userId);
  if (!user) return null;
  return { displayName: user.displayName, email: user.email };
}

async function currentUserId(req: express.Request): Promise<string | null> {
  const token = readSessionCookie(req);
  if (!token) return null;
  const session = verifySessionToken(token);
  return session?.userId ?? null;
}

export function createPublicSiteRouter() {
  const router = Router();

  router.use('/assets', express.static(publicSiteAssetsDir, {
    maxAge: devReload ? 0 : '1h',
    fallthrough: false,
  }));

  router.get('/', html(
    {
      title: 'WP Advertising — WordPress advertising plugin',
      description: 'Create house ads and WooCommerce product ads on your WordPress site. Free locally. See current Premium plans and trial options.',
      path: '/',
    },
    async () => homePage(await getBillingConfig()),
  ));

  router.get('/plugin', redirectHome());
  router.get('/pricing', redirectHome());
  router.get('/help', redirectHome());
  router.get('/help/:slug', redirectHome());
  router.get('/investors', redirectHome());

  router.get('/plugin/download', (_req, res) => {
    if (!config.pluginDownloadUrl) {
      res.redirect(302, '/#install');
      return;
    }
    res.redirect(302, config.pluginDownloadUrl);
  });

  router.get('/checkout', async (req, res, next) => {
    try {
    const settings = await getBillingConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderPage(
      { title: 'Checkout — WP Advertising', description: 'Get WP Advertising Premium via Stripe Checkout.', path: '/checkout' },
      checkoutPage(settings, {
        configured: isStripeCheckoutConfigured(),
        canceled: req.query.canceled === '1',
      }),
    ));
    } catch (error) { next(error); }
  });

  router.get('/checkout/success', async (req, res, next) => {
    try {
      const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
      let body = checkoutSuccessPage();
      if (sessionId && isStripeCheckoutConfigured()) {
        try {
          const result = await lookupLicenseForCheckoutSession(sessionId);
          body = checkoutSuccessPage({
            licenseKey: result.license?.licenseKey ?? null,
            pending: result.pending,
            email: result.session.customer_details?.email || result.session.customer_email,
          });
        } catch {
          body = checkoutSuccessPage({ pending: true });
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: 'Checkout success — WP Advertising', description: 'Premium activation next steps after Stripe Checkout.', path: '/checkout/success' },
        body,
      ));
    } catch (error) {
      next(error);
    }
  });

  router.post('/checkout/session', async (req, res, next) => {
    try {
      requireStripeCheckout();
      const input = checkoutSessionSchema.parse(req.body);
      const session = await createCheckoutSession(input);
      const wantsJson = (req.headers.accept || '').includes('application/json');
      if (wantsJson) {
        res.json({ ok: true, requestId: req.requestId, ...session });
        return;
      }
      res.redirect(303, session.url);
    } catch (error) {
      next(error);
    }
  });

  router.get('/community', async (req, res, next) => {
    try {
      const [posts, user] = await Promise.all([listForumPosts(), currentUser(req)]);
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: 'Community — WP Advertising', description: 'Discussion space for WP Advertising plugin users.', path: '/community' },
        communityForumIndex(posts, { user }),
        user,
      ));
    } catch (error) {
      next(error);
    }
  });

  router.get('/community/login', async (req, res, next) => {
    try {
      const user = await currentUser(req);
      if (user) {
        res.redirect(302, '/community');
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: 'Log in — Community', description: 'Log in to the WP Advertising Community.', path: '/community/login' },
        communityLoginPage(),
      ));
    } catch (error) {
      next(error);
    }
  });

  router.get('/community/register', async (req, res, next) => {
    try {
      const user = await currentUser(req);
      if (user) {
        res.redirect(302, '/community');
        return;
      }
      const prefillEmail = typeof req.query.email === 'string' ? req.query.email : undefined;
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: 'Register — Community', description: 'Create a WP Advertising Community account.', path: '/community/register' },
        communityRegisterPage(undefined, prefillEmail),
      ));
    } catch (error) {
      next(error);
    }
  });

  router.post('/community/register', async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      const user = await registerCommunityUser(input);
      setSessionCookie(res, createSessionToken(user.id));
      res.redirect(303, req.query.from === 'checkout' ? '/profile' : '/community');
    } catch (error) {
      if (error instanceof HttpError || error instanceof ZodError) {
        res.status(error instanceof HttpError ? error.status : 400).type('html').send(renderPage(
          { title: 'Register — Community', description: 'Create a WP Advertising Community account.', path: '/community/register' },
          communityRegisterPage(formErrorMessage(error)),
        ));
        return;
      }
      next(error);
    }
  });

  router.post('/community/login', async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const user = await loginCommunityUser(input);
      setSessionCookie(res, createSessionToken(user.id));
      res.redirect(303, '/community');
    } catch (error) {
      if (error instanceof HttpError || error instanceof ZodError) {
        res.status(error instanceof HttpError ? error.status : 400).type('html').send(renderPage(
          { title: 'Log in — Community', description: 'Log in to the WP Advertising Community.', path: '/community/login' },
          communityLoginPage(formErrorMessage(error)),
        ));
        return;
      }
      next(error);
    }
  });

  router.post('/community/logout', (_req, res) => {
    clearSessionCookie(res);
    res.redirect(303, '/community');
  });

  router.get('/community/posts/:slug', async (req, res, next) => {
    try {
      const [post, user] = await Promise.all([getForumPost(req.params.slug), currentUser(req)]);
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: `${post.title} — Community`, description: post.title, path: `/community/posts/${post.slug}` },
        communityForumPost(post, { user }),
        user,
      ));
    } catch (error) {
      next(error);
    }
  });

  router.post('/community/posts', async (req, res, next) => {
    try {
      const userId = await currentUserId(req);
      if (!userId) {
        res.redirect(303, '/community/login');
        return;
      }
      const input = createPostSchema.parse(req.body);
      const post = await createForumPost(userId, input);
      res.redirect(303, `/community/posts/${encodeURIComponent(post.slug)}`);
    } catch (error) {
      if (error instanceof HttpError || error instanceof ZodError) {
        const [posts, user] = await Promise.all([listForumPosts(), currentUser(req)]);
        res.status(error instanceof HttpError ? error.status : 400).type('html').send(renderPage(
          { title: 'Community — WP Advertising', description: 'Post failed', path: '/community' },
          communityForumIndex(posts, { notice: formErrorMessage(error), user }),
          user,
        ));
        return;
      }
      next(error);
    }
  });

  router.post('/community/posts/:slug/comments', async (req, res, next) => {
    try {
      const userId = await currentUserId(req);
      if (!userId) {
        res.redirect(303, '/community/login');
        return;
      }
      const input = createCommentSchema.parse(req.body);
      await createForumComment(userId, req.params.slug, input);
      res.redirect(303, `/community/posts/${encodeURIComponent(req.params.slug)}`);
    } catch (error) {
      if (error instanceof HttpError || error instanceof ZodError) {
        try {
          const [post, user] = await Promise.all([getForumPost(req.params.slug), currentUser(req)]);
          res.status(error instanceof HttpError ? error.status : 400).type('html').send(renderPage(
            { title: `${post.title} — Community`, description: post.title, path: `/community/posts/${post.slug}` },
            communityForumPost(post, { notice: formErrorMessage(error), user }),
            user,
          ));
          return;
        } catch {
          next(error);
          return;
        }
      }
      next(error);
    }
  });

  router.get('/profile', async (req, res, next) => {
    try {
      const token = readSessionCookie(req);
      if (!token) { res.redirect(302, '/community/login'); return; }
      const session = verifySessionToken(token);
      if (!session) { res.redirect(302, '/community/login'); return; }
      const dbUser = await getCommunityUserById(session.userId);
      if (!dbUser) { res.redirect(302, '/community/login'); return; }
      const [licenses, ownedSites] = await Promise.all([
        prisma.license.findMany({
          where: { customerEmail: dbUser.email },
          include: { activations: { where: { deactivatedAt: null } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.communitySite.findMany({
          where: { ownerEmail: dbUser.email.toLowerCase() },
          select: { id: true, siteUrl: true, siteDomain: true, siteName: true, networkStatus: true, networkAccessUntil: true, optedIn: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      const navUser: NavUser = { displayName: dbUser.displayName, email: dbUser.email };
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: 'Profile — WP Advertising', description: 'Your account and licenses.', path: '/profile' },
        profilePage(navUser, licenses.map(l => ({
          licenseKey: l.licenseKey,
          status: l.status,
          purchasedAt: l.createdAt,
          paidThrough: l.paidThrough,
          activatedSites: l.activations.map(a => a.domainSnapshot),
        })), ownedSites),
        navUser,
      ));
    } catch (error) {
      next(error);
    }
  });

  router.get('/privacy', html(
    { title: 'Privacy — WP Advertising', description: 'Privacy policy for WP Advertising plugin and community services.', path: '/privacy' },
    legalPage('Privacy Policy', [
      'WP Advertising processes site configuration and optional community delivery metrics to operate the product.',
      'Free local advertising does not require community-server communication.',
      'License and community requests may include site URL, plugin version, and entitlement identifiers.',
      'Community forum accounts store email, password hash, and display name.',
    ]),
  ));

  router.get('/terms', html(
    { title: 'Terms — WP Advertising', description: 'Terms of service for WP Advertising.', path: '/terms' },
    legalPage('Terms of Service', [
      'Use of the WP Advertising plugin and network is subject to acceptable-use rules for advertising creatives and publisher inventory.',
      'Premium entitlements are time-bounded. Network access ends when entitlement expires or is revoked.',
    ]),
  ));

  router.get('/community-standards', html(
    { title: 'Community standards — WP Advertising', description: 'Advertising and discussion standards for the WP Advertising Community.', path: '/community-standards' },
    legalPage('Community Standards', [
      'Members must not submit misleading, illegal, or abusive advertising creatives.',
      'Forum posts must stay useful and respectful. Operators may lock posts or disable posting for accounts that break these rules.',
    ]),
  ));

  router.get('/refunds', html(
    { title: 'Refunds — WP Advertising', description: 'Refund policy for WP Advertising Premium.', path: '/refunds' },
    legalPage('Refunds', [
      'Premium subscriptions are billed through Stripe. Refund requests are evaluated against the published policy at launch.',
      'Available Premium trials start in the plugin and do not require payment; see current trial terms on the home page.',
    ]),
  ));

  router.get('/contact', html(
    { title: 'Contact — WP Advertising', description: 'Contact WP Advertising support and partnerships.', path: '/contact' },
    contactPage(),
  ));

  router.get('/status', async (_req, res, next) => {
    try {
      const status = await getPublicStatus();
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(renderPage(
        { title: 'Status — WP Advertising', description: 'Public status for WP Advertising services.', path: '/status' },
        statusPage(status),
      ));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
