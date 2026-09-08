import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(), invoices: vi.fn(), list: vi.fn(), createSession: vi.fn(), price: vi.fn(),
  constructEvent: vi.fn(), invalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/services/stripeClient.js', () => ({
  getStripe: () => ({ subscriptions: { retrieve: mocks.retrieve, list: mocks.list }, invoices: { list: mocks.invoices }, prices: { retrieve: mocks.price } }),
  requireStripeCheckout: () => ({ checkout: { sessions: { create: mocks.createSession } } }),
  requireStripeWebhook: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: { invalidate: mocks.invalidate } }));

const { store, db } = vi.hoisted(() => {
  const store = { licenses: [] as any[], sites: [] as any[], activations: [] as any[], events: [] as any[], failWrite: false, lockCount: 0 };
  const db: any = {
    $queryRaw: vi.fn(async () => { store.lockCount++; return [{ id: 1 }]; }),
    billingConfig: { findUnique: vi.fn(async () => null) },
    stripeEvent: {
      findUnique: vi.fn(async ({ where }: any) => store.events.find((e) => e.id === where.id)),
      create: vi.fn(async ({ data }: any) => { store.events.push(data); return data; }),
    },
    license: {
      findFirst: vi.fn(async ({ where }: any) => store.licenses.find((l) => l.stripeSubscriptionId === where.stripeSubscriptionId)),
      create: vi.fn(async ({ data }: any) => { const row = { id: `lic_${store.licenses.length}`, ...data }; store.licenses.push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const row = store.licenses.find((l) => l.id === where.id); Object.assign(row, data); return row; }),
    },
    communitySite: {
      findFirst: vi.fn(async () => store.sites[0] ?? null),
      findUnique: vi.fn(async ({ where }: any) => store.sites.find((s) => s.id === where.id)),
      create: vi.fn(async ({ data }: any) => { const row = { id: 'site_1', optedIn: true, ...data }; store.sites.push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => {
        if (store.failWrite) throw new Error('simulated database failure');
        const row = store.sites.find((s) => s.id === where.id); Object.assign(row, data); return row;
      }),
    },
    licenseActivation: {
      create: vi.fn(async ({ data }: any) => { const row = { id: 'activation_1', deactivatedAt: null, ...data }; store.activations.push(row); return row; }),
      findMany: vi.fn(async ({ where }: any) => store.activations.filter((a) => {
        const license = store.licenses.find((l) => l.id === a.licenseId);
        return !a.deactivatedAt && (!where.licenseId || a.licenseId === where.licenseId)
          && (!where.siteId || a.siteId === where.siteId)
          && (!where.license || (license.status === 'ACTIVE' && license.expiresAt > where.license.expiresAt.gt));
      }).map((a) => ({ ...a, license: store.licenses.find((l) => l.id === a.licenseId) }))),
    },
  };
  let queue = Promise.resolve();
  db.$transaction = vi.fn((fn: any) => {
    const job = queue.then(async () => {
      const snapshot = structuredClone({ licenses: store.licenses, sites: store.sites, activations: store.activations, events: store.events });
      try { return await fn(db); } catch (error) { Object.assign(store, snapshot); throw error; }
    });
    queue = job.catch(() => undefined);
    return job;
  });
  return { store, db };
});
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));

import { createApp } from '../src/app.js';
import { billingWindow, dispatchStripeEvent, reconcileStripe } from '../src/services/stripeEventHandlers.js';
import { config } from '../src/config.js';
import { createCheckoutSession } from '../src/services/checkoutService.js';
const app = createApp();
const NOW = new Date('2030-02-01T00:00:00Z');
const seconds = (date: string) => Date.parse(date) / 1000;
function subscription(overrides: Record<string, unknown> = {}) {
  return { id: 'sub_test', status: 'active', customer: 'cus_test', current_period_end: seconds('2030-03-01'),
    metadata: { application: 'wp-advertising', siteUrl: 'https://shop.example.com', failureGraceDays: '3' },
    items: { data: [{ price: { id: 'price_monthly' } }] }, latest_invoice: { id: 'in_new', status: 'paid', paid: true, attempted: true },
    ...overrides,
  } as unknown as Stripe.Subscription;
}
function paid(until = '2030-03-01') {
  return { data: [{ customer_email: 'buyer@example.com', lines: { data: [{ type: 'subscription', period: { end: seconds(until) } }] } }] };
}
function event(id = 'evt_1', type = 'invoice.paid') {
  return { id, type, created: seconds('2030-02-01'), data: { object: { id: 'sub_test', subscription: 'sub_test', status: 'old-payload' } } } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
  vi.clearAllMocks();
  Object.assign(store, { licenses: [], sites: [], activations: [], events: [], failWrite: false, lockCount: 0 });
  mocks.retrieve.mockResolvedValue(subscription()); mocks.invoices.mockResolvedValue(paid());
  mocks.invalidate.mockResolvedValue(undefined);
  db.billingConfig.findUnique.mockResolvedValue(null);
});

afterEach(() => vi.useRealTimers());

// Public endpoint tests also prove the verified event enters the transactional path.
describe('billing synchronization', () => {
  it('handles paid invoices and concurrent duplicate deliveries exactly once', async () => {
    await Promise.all([dispatchStripeEvent(event()), dispatchStripeEvent(event())]);
    expect(store.licenses).toHaveLength(1); expect(store.events).toHaveLength(1);
    expect(store.sites[0].networkStatus).toBe('ACTIVE');
    expect(store.licenses[0].expiresAt.toISOString()).toBe('2030-03-01T00:00:00.000Z');
    expect(mocks.retrieve).toHaveBeenCalledTimes(1); expect(store.lockCount).toBe(2);
  });
  it('uses current Stripe state for delayed failed-payment and subscription events, including same-second events', async () => {
    await dispatchStripeEvent(event('evt_new'));
    await dispatchStripeEvent(event('evt_old', 'invoice.payment_failed'));
    await dispatchStripeEvent(event('evt_older', 'customer.subscription.deleted'));
    expect(store.licenses[0].status).toBe('ACTIVE');
    expect(mocks.retrieve).toHaveBeenCalledTimes(3);
  });
  it('rolls back the event and every write, then retries successfully', async () => {
    store.failWrite = true;
    await expect(dispatchStripeEvent(event())).rejects.toThrow('database failure');
    expect(store.events).toHaveLength(0); expect(store.licenses).toHaveLength(0); expect(store.sites).toHaveLength(0);
    store.failWrite = false; await dispatchStripeEvent(event()); expect(store.licenses).toHaveLength(1);
  });
  it('does not acknowledge Stripe read failures as completed events', async () => {
    mocks.retrieve.mockRejectedValueOnce(new Error('Stripe unavailable'));
    await expect(dispatchStripeEvent(event())).rejects.toThrow('Stripe unavailable'); expect(store.events).toHaveLength(0);
    await dispatchStripeEvent(event()); expect(store.events).toHaveLength(1);
  });
  it('does not grant access for an unpaid initial checkout', async () => {
    mocks.invoices.mockResolvedValue({ data: [] });
    mocks.retrieve.mockResolvedValue(subscription({ status: 'incomplete' }));
    await dispatchStripeEvent(event('evt_initial', 'checkout.session.completed'));
    expect(store.licenses[0].status).toBe('EXPIRED'); expect(store.sites[0].networkStatus).toBe('EXPIRED');
  });
  it('bounds failed-renewal grace and restores eligibility after payment', async () => {
    mocks.invoices.mockResolvedValue(paid('2030-02-01'));
    mocks.retrieve.mockResolvedValue(subscription({ status: 'past_due', latest_invoice: { id: 'in_failure', status: 'open', attempted: true, paid: false } }));
    await dispatchStripeEvent(event('evt_failed', 'invoice.payment_failed'));
    expect(store.licenses[0].graceUntil.toISOString()).toBe('2030-02-04T00:00:00.000Z');
    vi.setSystemTime(new Date('2030-02-05'));
    await dispatchStripeEvent(event('evt_retry', 'invoice.payment_failed'));
    expect(store.licenses[0].status).toBe('EXPIRED');
    expect(store.licenses[0].graceUntil.toISOString()).toBe('2030-02-04T00:00:00.000Z');
    mocks.invoices.mockResolvedValue(paid()); mocks.retrieve.mockResolvedValue(subscription());
    await dispatchStripeEvent(event('evt_recovered'));
    expect(store.licenses[0].graceUntil).toBeNull(); expect(store.sites[0].networkStatus).toBe('ACTIVE');
  });
  it('preserves explicit operator suspension and revocation', async () => {
    await dispatchStripeEvent(event()); store.sites[0].networkStatus = 'SUSPENDED';
    store.licenses[0].status = 'REVOKED';
    await dispatchStripeEvent(event('evt_again')); expect(store.sites[0].networkStatus).toBe('SUSPENDED'); expect(store.licenses[0].status).toBe('REVOKED');
  });
  it('reconciles Stripe subscriptions even if their checkout event was lost', async () => {
    mocks.list.mockResolvedValue({ data: [{ id: 'sub_test' }], has_more: true });
    const result = await reconcileStripe({}); expect(store.licenses).toHaveLength(1); expect(result.nextCursor).toBe('sub_test');
  });
  it('skips unrelated Stripe subscriptions', async () => {
    mocks.retrieve.mockResolvedValue(subscription({ metadata: {}, items: { data: [] } }));
    await dispatchStripeEvent(event()); expect(store.licenses).toHaveLength(0);
  });
  it('deduplicated retries also repair cache invalidation after a committed write', async () => {
    mocks.invalidate.mockRejectedValueOnce(new Error('cache unavailable'));
    await expect(dispatchStripeEvent(event())).rejects.toThrow('cache unavailable');
    expect(store.events).toHaveLength(1);
    await dispatchStripeEvent(event()); expect(mocks.invalidate).toHaveBeenLastCalledWith(['site_1']);
  });
  it('validates signatures and handles invoice events at the webhook endpoint', async () => {
    config.stripeWebhookSecret = 'whsec_test'; mocks.constructEvent.mockReturnValue(event());
    await request(app).post('/v1/webhooks/stripe').set('Content-Type', 'application/json').send('{}').expect(400);
    await request(app).post('/v1/webhooks/stripe').set('Stripe-Signature', 'test').set('Content-Type', 'application/json').send('{}').expect(200);
    expect(store.licenses).toHaveLength(1);
  });
});

describe('billing access policy', () => {
  it('zero grace expires at the paid boundary', () => {
    const window = billingWindow(subscription({ status: 'past_due', latest_invoice: { id: 'in_bad', status: 'open', attempted: true } }), NOW, null, 0, NOW);
    expect(window.status).toBe('EXPIRED'); expect(window.expiresAt).toEqual(NOW);
  });
  it('cancellation ends access even with a future paid period', () => {
    const window = billingWindow(subscription({ status: 'canceled', ended_at: NOW.getTime() / 1000 }), new Date('2030-03-01'), null, 3, NOW);
    expect(window.status).toBe('EXPIRED'); expect(window.expiresAt).toEqual(NOW);
  });
});

it('checkout charges the configured plan and snapshots the grace policy', async () => {
  db.billingConfig.findUnique.mockResolvedValue({ id: 1, updatedAt: NOW, monthlyPriceId: 'price_monthly', annualPriceId: '', monthlyAmount: 1900, annualAmount: 0, monthlyEnabled: true, annualEnabled: false, trialDays: 14, failureGraceDays: 2 });
  mocks.price.mockResolvedValue({ active: true, currency: 'usd', unit_amount: 1900, billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } });
  mocks.createSession.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' });
  await createCheckoutSession({ plan: 'monthly', siteUrl: 'https://shop.example.com', email: 'buyer@example.com' });
  expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_monthly', quantity: 1 }], subscription_data: { metadata: expect.objectContaining({ failureGraceDays: '2', application: 'wp-advertising' }) } }));
});
