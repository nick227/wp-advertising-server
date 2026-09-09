import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
const { retrieve, invoices } = vi.hoisted(() => ({ retrieve: vi.fn(), invoices: vi.fn() }));
vi.mock('../src/services/stripeClient.js', () => ({ getStripe: () => ({ subscriptions: { retrieve }, invoices: { list: invoices } }) }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: { invalidate: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../src/lib/prisma.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: process.env.BILLING_TEST_DATABASE_URL || process.env.DATABASE_URL } } }) };
});
import { prisma } from '../src/lib/prisma.js';
import { dispatchStripeEvent } from '../src/services/stripeEventHandlers.js';
import { expireDueEntitlements } from '../src/services/entitlementService.js';

const enabled = Boolean(process.env.BILLING_TEST_DATABASE_URL);
const end = Math.floor(Date.now() / 1000) + 86400 * 30;
function event(id: string) {
  return { id, type: 'invoice.paid', data: { object: { subscription: 'sub_mysql', customer: 'cus_mysql' } } } as Stripe.Event;
}
afterAll(async () => { await prisma.$disconnect(); });
describe.skipIf(!enabled)('billing transactions on isolated MySQL', () => {
  beforeEach(async () => {
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL!);
    if (!/^\/wpa_billing_test_[a-f0-9]+$/.test(url.pathname)) throw new Error('Requires a generated scratch database');
    await prisma.stripeEvent.deleteMany(); await prisma.licenseActivation.deleteMany();
    await prisma.license.deleteMany(); await prisma.communitySite.deleteMany();
    retrieve.mockReset().mockResolvedValue({ id: 'sub_mysql', customer: 'cus_mysql', status: 'active', current_period_end: end,
      metadata: { application: 'wp-advertising', siteUrl: 'https://mysql-test.example.com', failureGraceDays: '3' },
      items: { data: [] }, latest_invoice: { id: 'in_mysql', status: 'paid', paid: true, attempted: true },
    });
    invoices.mockResolvedValue({ data: [{ lines: { data: [{ type: 'subscription', period: { end } }] } }] });
  });
  it('serializes concurrent duplicate events and commits one license, activation, and event', async () => {
    await Promise.all(Array.from({ length: 4 }, () => dispatchStripeEvent(event('evt_mysql'))));
    expect(await prisma.license.count()).toBe(1); expect(await prisma.licenseActivation.count()).toBe(1);
    expect(await prisma.stripeEvent.count()).toBe(1); expect(retrieve).toHaveBeenCalledTimes(1);
    expect((await prisma.communitySite.findFirst())?.networkStatus).toBe('ACTIVE');
  });
  it('expires durable license and network eligibility at the fixed deadline', async () => {
    await dispatchStripeEvent(event('evt_expiry'));
    const deadline = new Date(Date.now() - 1000);
    await prisma.license.updateMany({ data: { expiresAt: deadline, graceUntil: deadline } });
    await prisma.communitySite.updateMany({ data: { networkAccessUntil: deadline } });
    await expireDueEntitlements();
    expect((await prisma.license.findFirst())?.status).toBe('EXPIRED');
    expect((await prisma.communitySite.findFirst())?.networkStatus).toBe('EXPIRED');
  });
  it('rolls back every entitlement write if the final event insert fails', async () => {
    // The event ID exceeds the real column width, forcing failure after entitlement writes.
    await expect(dispatchStripeEvent(event('x'.repeat(300)))).rejects.toThrow();
    expect(await prisma.license.count()).toBe(0); expect(await prisma.communitySite.count()).toBe(0);
    expect(await prisma.stripeEvent.count()).toBe(0);
    await dispatchStripeEvent(event('evt_retry')); expect(await prisma.license.count()).toBe(1);
  });
});

