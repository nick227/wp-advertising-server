import { initializeBillingConfig } from './services/billingConfigService.js';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config, configSummary, validateConfig } from './config.js';
import { eventQueue } from './services/eventQueue.js';
import { rotationCache } from './services/rotationCache.js';
import { entitlementSweeper } from './services/entitlementService.js';
import { seedForumIfEmpty } from './services/forumSeed.js';
import { prisma } from './lib/prisma.js';

const validation = validateConfig();
for (const warning of validation.warnings) console.warn(`config warning: ${warning}`);
console.log('config summary', configSummary());

async function probeDatabase(retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('database connection verified');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < retries) {
        console.warn(`database probe attempt ${attempt}/${retries} failed: ${message} — retrying in ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error(`database unreachable after ${retries} attempts: ${message}`);
        process.exit(1);
      }
    }
  }
}

await probeDatabase();
try { await initializeBillingConfig(); }
catch (error) { console.error('Billing configuration import failed; configure Plans & Trials in admin', error); }

try {
  const seed = await seedForumIfEmpty();
  if (seed.seeded) console.log(`community forum seeded (${seed.posts} pinned posts)`);
} catch (error) {
  console.error('community forum seed failed', error);
}

const app = createApp();
const server = createServer(app);
let shuttingDown = false;

eventQueue.start();
rotationCache.start();
entitlementSweeper.start();
if (config.rotationCacheWarmOnStart) {
  rotationCache.warm().catch((error) => console.error('initial rotation cache warm failed', error));
}

server.listen(config.port, () => {
  console.log(`${config.serviceName} v${config.version} listening on :${config.port}`);
});

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; stopping server, flushing events, and disconnecting database`);

  const forceExit = setTimeout(() => {
    console.error(`shutdown exceeded ${config.shutdownTimeoutMs}ms; forcing exit`);
    process.exit(1);
  }, config.shutdownTimeoutMs);
  forceExit.unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    eventQueue.stop();
    rotationCache.stop();
    entitlementSweeper.stop();
    await eventQueue.flush().catch((error) => console.error('event flush failed during shutdown', error));
    await prisma.$disconnect().catch((error) => console.error('database disconnect failed during shutdown', error));
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error('shutdown failed', error);
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('uncaughtException', (error) => {
  console.error('uncaught exception', error);
  void shutdown('uncaughtException');
});
process.once('unhandledRejection', (reason) => {
  console.error('unhandled rejection', reason);
  void shutdown('unhandledRejection');
});
