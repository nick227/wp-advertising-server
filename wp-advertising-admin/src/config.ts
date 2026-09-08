import 'dotenv/config';

function trimSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export const config = {
  port: Number(process.env.PORT || 4200),
  nodeEnv: process.env.NODE_ENV || 'development',
  adServerBaseUrl: trimSlash(process.env.AD_SERVER_BASE_URL || 'http://localhost:4100/v1'),
  sessionSecret: process.env.SESSION_SECRET || 'change-me-admin-session-secret-min-32-chars',
};

export function validateConfig() {
  if (!config.adServerBaseUrl.startsWith('http')) {
    throw new Error('AD_SERVER_BASE_URL must be an http(s) URL ending at /v1');
  }
  if (config.nodeEnv === 'production' && config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
}
