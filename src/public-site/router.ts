import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router, type RequestHandler } from 'express';
import { isStripeCheckoutConfigured } from '../config.js';
import { lookupLicenseForCheckoutSession } from '../services/billingService.js';
import { checkoutSessionSchema, createCheckoutSession } from '../services/checkoutService.js';
import { requireStripeCheckout } from '../services/stripeClient.js';
import { renderPage } from './layout.js';
import {
  checkoutPage,
  checkoutSuccessPage,
  communityPage,
  contactPage,
  helpArticle,
  helpIndexPage,
  homePage,
  investorsPage,
  legalPage,
  pluginPage,
  pricingPage,
  statusPage,
} from './pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const publicSiteAssetsDir = path.resolve(__dirname, '../../public-site/assets');

const CACHE_CONTROL = 'public, max-age=300';

function html(meta: { title: string; description: string; path: string }, body: string): RequestHandler {
  return (_req, res) => {
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.type('html').send(renderPage(meta, body));
  };
}

const helpBodies: Record<string, { title: string; body: string }> = {
  'getting-started': {
    title: 'Getting started',
    body: `<p>Install WP Advertising, create a house ad, and keep Community API URL blank for Free local mode. Activate Trial only when you need external embeds or Community.</p>`,
  },
  'local-ads': {
    title: 'Local ads',
    body: `<p>Free advertising runs entirely on your WordPress site. Visitors never contact the WP Advertising community server.</p>`,
  },
  'community-network': {
    title: 'Community network',
    body: `<p>Entitled sites call <code>/v1/community/serve</code> server-to-server. Serve responses expose advertiser <code>targetUrl</code> only — no permanent Railway tracking URLs in HTML.</p>`,
  },
  woocommerce: {
    title: 'WooCommerce',
    body: `<p>Promote catalog products with native creatives. Advanced automation and higher limits require Trial or Pro.</p>`,
  },
  embeds: {
    title: 'Embeds',
    body: `<p>Same-domain embeds are Free. Loading embeds from other domains requires an active Trial or Pro entitlement.</p>`,
  },
  tracking: {
    title: 'Tracking',
    body: `<p>Local tracking stays on your WordPress site. Network impressions are counted when Community serve succeeds — browsers do not hit Railway pixels.</p>`,
  },
  licensing: {
    title: 'Licensing',
    body: `<p>The 30-day Trial starts when external or community advertising is first activated. When access expires, the plugin stops community calls and the server removes the site from rotation.</p>`,
  },
  billing: {
    title: 'Billing',
    body: `<p>Pro uses Stripe-hosted Checkout. Subscription changes and refunds are managed in Stripe; WP Advertising updates entitlement from signed webhooks.</p>`,
  },
  privacy: {
    title: 'Privacy',
    body: `<p>License validation may send site URL, plugin version, and license key. Community participation syncs site URL, creative, and aggregate delivery metrics. Publisher identity stays anonymized in advertiser reports by default.</p>`,
  },
  troubleshooting: {
    title: 'Troubleshooting',
    body: `<p>If Community returns empty, confirm Trial/Pro entitlement, opt-in status, and that a house creative is synced. Expired entitlements produce no community-server traffic from the plugin.</p>`,
  },
};

export function createPublicSiteRouter() {
  const router = Router();

  router.use('/assets', express.static(publicSiteAssetsDir, {
    maxAge: '1h',
    fallthrough: false,
  }));

  router.get('/', html(
    { title: 'WP Advertising — The advertising network built for WordPress', description: 'Free local WordPress ads. Trial and Pro for external embeds and the WP Advertising Community network.', path: '/' },
    homePage(),
  ));

  router.get('/plugin', html(
    { title: 'Plugin — WP Advertising', description: 'Free same-domain advertising with optional Trial/Pro network distribution.', path: '/plugin' },
    pluginPage(),
  ));

  router.get('/pricing', html(
    { title: 'Pricing — WP Advertising', description: 'Free local advertising, 30-day Trial, and Pro for community distribution.', path: '/pricing' },
    pricingPage(),
  ));

  router.get('/checkout', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderPage(
      { title: 'Checkout — WP Advertising', description: 'Start Stripe-hosted Checkout for WP Advertising Pro.', path: '/checkout' },
      checkoutPage({
        configured: isStripeCheckoutConfigured(),
        canceled: req.query.canceled === '1',
      }),
    ));
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
        { title: 'Checkout success — WP Advertising', description: 'Pro activation next steps after Stripe Checkout.', path: '/checkout/success' },
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

  router.get('/community', html(
    { title: 'Community — WP Advertising', description: 'Trial and Pro member community for publishers and advertisers.', path: '/community' },
    communityPage(),
  ));

  router.get('/help', html(
    { title: 'Help — WP Advertising', description: 'Documentation for local ads, community network, licensing, and billing.', path: '/help' },
    helpIndexPage(),
  ));

  router.get('/help/:slug', (req, res, next) => {
    const article = helpBodies[req.params.slug];
    if (!article) {
      next();
      return;
    }
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.type('html').send(renderPage(
      { title: `${article.title} — WP Advertising Help`, description: article.title, path: `/help/${req.params.slug}` },
      helpArticle(article.title, article.body),
    ));
  });

  router.get('/investors', html(
    { title: 'Investors — WP Advertising', description: 'Company thesis and cost-disciplined WordPress advertising network.', path: '/investors' },
    investorsPage(),
  ));

  router.get('/privacy', html(
    { title: 'Privacy — WP Advertising', description: 'Privacy policy for WP Advertising plugin and community services.', path: '/privacy' },
    legalPage('Privacy Policy', [
      'WP Advertising processes site configuration and optional community delivery metrics to operate the product.',
      'Free local advertising does not require community-server communication.',
      'License and community requests may include site URL, plugin version, and entitlement identifiers.',
    ]),
  ));

  router.get('/terms', html(
    { title: 'Terms — WP Advertising', description: 'Terms of service for WP Advertising.', path: '/terms' },
    legalPage('Terms of Service', [
      'Use of the WP Advertising plugin and network is subject to acceptable-use rules for advertising creatives and publisher inventory.',
      'Trial and Pro entitlements are time-bounded. Network access ends when entitlement expires or is revoked.',
    ]),
  ));

  router.get('/community-standards', html(
    { title: 'Community standards — WP Advertising', description: 'Advertising and discussion standards for the WP Advertising Community.', path: '/community-standards' },
    legalPage('Community Standards', [
      'Members must not submit misleading, illegal, or abusive advertising creatives.',
      'Publisher identity remains anonymized in advertiser reporting unless a publisher opts in to disclosure.',
    ]),
  ));

  router.get('/refunds', html(
    { title: 'Refunds — WP Advertising', description: 'Refund policy for WP Advertising Pro.', path: '/refunds' },
    legalPage('Refunds', [
      'Pro subscriptions are billed through Stripe. Refund requests are evaluated against the published policy at launch.',
      'Trial access is free and does not require payment.',
    ]),
  ));

  router.get('/contact', html(
    { title: 'Contact — WP Advertising', description: 'Contact WP Advertising support and partnerships.', path: '/contact' },
    contactPage(),
  ));

  router.get('/status', html(
    { title: 'Status — WP Advertising', description: 'Public status for WP Advertising services.', path: '/status' },
    statusPage(),
  ));

  return router;
}
