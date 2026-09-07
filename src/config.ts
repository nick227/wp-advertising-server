import 'dotenv/config';

function numberFromEnv(name: string, fallback: number, min = 0) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function booleanFromEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

export const config = {
  serviceName: 'wp-ad-community-service',
  version: '4.0.0',
  port: numberFromEnv('PORT', 4100),
  databaseUrl: process.env.DATABASE_URL || '',
  publicBaseUrl: trimTrailingSlash(process.env.PUBLIC_BASE_URL || 'http://localhost:4100/v1'),
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV || 'development',

  adminToken: process.env.ADMIN_TOKEN || '',
  eventTokenSecret: process.env.EVENT_TOKEN_SECRET || 'dev-secret-change-me',
  eventTrackingEnabled: booleanFromEnv('EVENT_TRACKING_ENABLED', true),

  rotationCacheTtlMs: numberFromEnv('ROTATION_CACHE_TTL_MS', 300000),
  rotationCacheWarmOnStart: booleanFromEnv('ROTATION_CACHE_WARM_ON_START', true),

  eventFlushIntervalMs: numberFromEnv('EVENT_FLUSH_INTERVAL_MS', 2000),
  eventFlushMaxBatch: numberFromEnv('EVENT_FLUSH_MAX_BATCH', 500),
  eventMaxQueue: numberFromEnv('EVENT_MAX_QUEUE', 5000),
  eventFlushLogThrottleMs: numberFromEnv('EVENT_FLUSH_LOG_THROTTLE_MS', 30000),
  shutdownTimeoutMs: numberFromEnv('SHUTDOWN_TIMEOUT_MS', 10000, 1000),
  rateLimitMaxBuckets: numberFromEnv('RATE_LIMIT_MAX_BUCKETS', 10000),
  rawEventsEnabled: booleanFromEnv('RAW_EVENTS_ENABLED', false),

  rateLimitWindowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitServeMax: numberFromEnv('RATE_LIMIT_SERVE_MAX', 600),
  rateLimitEventsMax: numberFromEnv('RATE_LIMIT_EVENTS_MAX', 2000),
  rateLimitWriteMax: numberFromEnv('RATE_LIMIT_WRITE_MAX', 120),
  rateLimitRegisterMax: numberFromEnv('RATE_LIMIT_REGISTER_MAX', 10),
  rateLimitAdminMax: numberFromEnv('RATE_LIMIT_ADMIN_MAX', 120),

  rejectPrivateUrlsInProduction: booleanFromEnv('REJECT_PRIVATE_URLS_IN_PRODUCTION', true),

  publicSiteUrl: trimTrailingSlash(
    process.env.PUBLIC_SITE_URL || derivePublicSiteUrl(process.env.PUBLIC_BASE_URL || 'http://localhost:4100/v1'),
  ),
  pluginDownloadUrl: (process.env.PLUGIN_DOWNLOAD_URL || '').trim(),
  sessionSecret: (process.env.SESSION_SECRET || process.env.EVENT_TOKEN_SECRET || 'dev-secret-change-me').trim(),
  stripeSecretKey: (process.env.STRIPE_SECRET_KEY || '').trim(),
  stripeWebhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
  stripePriceMonthly: (process.env.STRIPE_PRICE_MONTHLY || '').trim(),
  stripePriceAnnual: (process.env.STRIPE_PRICE_ANNUAL || '').trim(),
};

export function isStripeCheckoutConfigured(): boolean {
  return Boolean(
    config.stripeSecretKey
    && (config.stripePriceMonthly || config.stripePriceAnnual)
    && isValidHttpUrl(config.publicSiteUrl),
  );
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
}

export function validateConfig() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.databaseUrl) errors.push('DATABASE_URL is required');
  if (!isValidHttpUrl(config.publicBaseUrl)) errors.push('PUBLIC_BASE_URL must be a valid http/https URL');
  if (config.port < 1 || config.port > 65535) errors.push('PORT must be between 1 and 65535');

  const positiveLimits: Array<[string, number]> = [
    ['RATE_LIMIT_SERVE_MAX', config.rateLimitServeMax],
    ['RATE_LIMIT_EVENTS_MAX', config.rateLimitEventsMax],
    ['RATE_LIMIT_WRITE_MAX', config.rateLimitWriteMax],
    ['RATE_LIMIT_REGISTER_MAX', config.rateLimitRegisterMax],
    ['RATE_LIMIT_ADMIN_MAX', config.rateLimitAdminMax],
    ['EVENT_FLUSH_MAX_BATCH', config.eventFlushMaxBatch],
    ['EVENT_MAX_QUEUE', config.eventMaxQueue],
  ];
  for (const [name, value] of positiveLimits) {
    if (value < 1) errors.push(`${name} must be at least 1`);
  }

  if (config.nodeEnv === 'production') {
    if (!config.adminToken || config.adminToken === 'change-me') errors.push('ADMIN_TOKEN must be set to a strong value in production');
    else if (config.adminToken.length < 32) errors.push('ADMIN_TOKEN must be at least 32 characters in production');
    if (!config.eventTokenSecret || config.eventTokenSecret === 'change-me' || config.eventTokenSecret === 'dev-secret-change-me') {
      errors.push('EVENT_TOKEN_SECRET must be set to a strong value in production');
    } else if (config.eventTokenSecret.length < 32) {
      errors.push('EVENT_TOKEN_SECRET must be at least 32 characters in production');
    }
    if (config.publicBaseUrl.startsWith('http://')) warnings.push('PUBLIC_BASE_URL is using http in production');
    warnings.push('Rate limiter is in-memory; run as a single replica or replace with a distributed store before scaling horizontally');
  } else {
    if (!config.adminToken || config.adminToken === 'change-me') warnings.push('ADMIN_TOKEN is using the development default');
    if (config.eventTokenSecret === 'dev-secret-change-me') warnings.push('EVENT_TOKEN_SECRET is using the development default');
  }

  if (errors.length) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }

  return { ok: true, warnings };
}

export function configSummary() {
  return {
    serviceName: config.serviceName,
    version: config.version,
    nodeEnv: config.nodeEnv,
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    corsOrigins: config.corsOrigins,
    databaseConfigured: Boolean(config.databaseUrl),
    adminTokenConfigured: Boolean(config.adminToken && config.adminToken !== 'change-me'),
    eventTrackingEnabled: config.eventTrackingEnabled,
    rawEventsEnabled: config.rawEventsEnabled,
    rotationCacheTtlMs: config.rotationCacheTtlMs,
    rateLimitMaxBuckets: config.rateLimitMaxBuckets,
    eventFlushIntervalMs: config.eventFlushIntervalMs,
    eventMaxQueue: config.eventMaxQueue,
    publicSiteUrl: config.publicSiteUrl,
    stripeCheckoutConfigured: isStripeCheckoutConfigured(),
    stripeWebhookConfigured: isStripeWebhookConfigured(),
  };
}

export function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function derivePublicSiteUrl(publicBaseUrl: string): string {
  const trimmed = trimTrailingSlash(publicBaseUrl);
  return trimmed.replace(/\/v1$/i, '') || trimmed;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
