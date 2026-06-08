// Set process.env before any module (including config.ts via dotenv) is loaded.
// Vitest runs setupFiles before importing test modules, so these values are in
// place when config.ts evaluates `import 'dotenv/config'`, which only sets vars
// that are not already defined.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/wp_ad_test';
process.env.ADMIN_TOKEN = 'test-admin-token-static-value-for-ci';
process.env.EVENT_TOKEN_SECRET = 'test-event-secret-static-value-for-ci';
process.env.PUBLIC_BASE_URL = 'http://localhost:4100/v1';
process.env.ROTATION_CACHE_WARM_ON_START = 'false';
