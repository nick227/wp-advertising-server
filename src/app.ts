import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { healthRouter } from './routes/health.js';
import { sitesRouter } from './routes/sites.js';
import { adsRouter } from './routes/ads.js';
import { communityRouter } from './routes/community.js';
import { adminRouter } from './routes/admin.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createPublicSiteRouter } from './public-site/router.js';
import { entitlementsRouter } from './routes/entitlements.js';
import { stripeWebhookHandler } from './routes/stripeWebhook.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }));
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));

  // Stripe needs the raw body for signature verification.
  app.post('/v1/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(requestIdMiddleware);

  app.use(createPublicSiteRouter());

  const v1 = express.Router();
  v1.use(healthRouter);
  v1.use(sitesRouter);
  v1.use(adsRouter);
  v1.use(communityRouter);
  v1.use(entitlementsRouter);
  v1.use(adminRouter);

  app.use('/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
