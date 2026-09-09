import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), retrieve: vi.fn(), sync: vi.fn(), config: vi.fn(),
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: { communitySite: { findUnique: mocks.find, update: mocks.update } } }));
vi.mock('../src/services/stripeClient.js', () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }) }));
vi.mock('../src/services/stripeEventHandlers.js', () => ({ synchronizeStripe: mocks.sync }));
vi.mock('../src/services/billingConfigService.js', () => ({ getBillingConfig: mocks.config }));
import { validateEntitlement } from '../src/services/entitlementService.js';
const site = { id: 'site_a', publicKey: 'key_test_123', status: 'ACTIVE', networkStatus: 'ACTIVE', networkAccessUntil: new Date(Date.now() + 86400000) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockResolvedValue(site); mocks.update.mockResolvedValue(site);
});
it('recovers the purchased subscription without consulting current pricing', async () => {
  mocks.retrieve.mockResolvedValue({ mode: 'subscription', metadata: { siteId: site.id }, subscription: 'sub_old_price' });
  await validateEntitlement({ siteId: site.id, apiKey: site.publicKey, checkoutSessionId: 'cs_test' });
  expect(mocks.sync).toHaveBeenCalledWith('sub_old_price', undefined, site.id);
  expect(mocks.config).not.toHaveBeenCalled();
});
it('does not reconcile a checkout belonging to another site', async () => {
  mocks.retrieve.mockResolvedValue({ mode: 'subscription', metadata: { siteId: 'site_other' }, subscription: 'sub_other' });
  await validateEntitlement({ siteId: site.id, apiKey: site.publicKey, checkoutSessionId: 'cs_test' });
  expect(mocks.sync).not.toHaveBeenCalled();
});
it('does not manufacture an unlimited one-time entitlement', async () => {
  mocks.retrieve.mockResolvedValue({ mode: 'payment', payment_status: 'paid', metadata: { siteId: site.id, plan: 'oneTime' } });
  await validateEntitlement({ siteId: site.id, apiKey: site.publicKey, checkoutSessionId: 'cs_test' });
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: site.id }, data: { lastSeenAt: expect.any(Date) } });
});
