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

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestIdMiddleware);

  const v1 = express.Router();
  v1.use(healthRouter);
  v1.use(sitesRouter);
  v1.use(adsRouter);
  v1.use(communityRouter);
  v1.use(adminRouter);

  app.use('/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
