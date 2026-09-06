import { Prisma } from '@prisma/client';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type Stripe from 'stripe';

const constructEvent = vi.fn();
const sessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
const subscriptionsRetrieve = vi.fn();

vi.mock('stripe', () => ({
  default: class StripeMock {
    webhooks = { constructEvent };
    checkout = { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve } };
    subscriptions = { retrieve: subscriptionsRetrieve };
  },
}));

const { p, rc } = vi.hoisted(() => {
  const p = {
    stripeEvent: { create: vi.fn(), delete: vi.fn() },
    communitySite: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    license: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    licenseActivation: { upsert: vi.fn(), update: vi.fn() },
  };
  const rc = { invalidate: vi.fn().mockResolvedValue(undefined) };
  return { p, rc };
});

vi.mock('../src/lib/prisma.js', () => ({ prisma: p }));
vi.mock('../src/services/rotationCache.js', () => ({ rotationCache: rc }));

import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { resetStripeClientForTests } from '../src/services/stripeClient.js';

const app = createApp();

const previousStripe = {
  stripeSecretKey: config.stripeSecretKey,
  stripeWebhookSecret: config.stripeWebhookSecret,
  stripePriceMonthly: config.stripePriceMonthly,
  stripePriceAnnual: config.stripePriceAnnual,
};

describe('Stripe checkout + webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStripeClientForTests();
    config.stripeSecretKey = 'sk_test_p3';
    config.stripeWebhookSecret = 'whsec_test_p3';
    config.stripePriceMonthly = 'price_monthly_test';
    config.stripePriceAnnual = 'price_annual_test';
  });

  afterEach(() => {
    Object.assign(config, previousStripe);
    resetStripeClientForTests();
  });

  it('creates a Checkout Session when Stripe is configured', async () => {
    sessionsCreate.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });

    const res = await request(app)
      .post('/checkout/session')
      .set('Accept', 'application/json')
      .send({
        plan: 'monthly',
        email: 'buyer@example.com',
        siteUrl: 'https://shop.example.com',
      });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('checkout.stripe.com');
    expect(sessionsCreate).toHaveBeenCalled();
  });

  it('activates Pro from checkout.session.completed and is idempotent', async () => {
    const accessUntil = new Date(Date.now() + 30 * 86400000);
    const session = {
      id: 'cs_test_completed',
      metadata: { siteUrl: 'https://shop.example.com', plan: 'monthly' },
      client_reference_id: 'https://shop.example.com',
      customer: 'cus_test',
      subscription: 'sub_test',
      customer_details: { email: 'buyer@example.com' },
      customer_email: 'buyer@example.com',
    } as unknown as Stripe.Checkout.Session;

    constructEvent.mockReturnValue({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: { object: session },
    });
    subscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test',
      current_period_end: Math.floor(accessUntil.getTime() / 1000),
    });

    p.stripeEvent.create
      .mockResolvedValueOnce({ id: 'evt_test_1', type: 'checkout.session.completed' })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

    p.communitySite.findFirst.mockResolvedValue(null);
    p.communitySite.create.mockResolvedValue({
      id: 'site_1',
      siteUrl: 'https://shop.example.com',
      siteDomain: 'shop.example.com',
      publicKey: 'pub_test',
      networkStatus: 'ACTIVE',
      networkAccessUntil: accessUntil,
    });
    p.license.findFirst.mockResolvedValue(null);
    p.license.create.mockResolvedValue({
      id: 'lic_1',
      licenseKey: 'lic_abcdef',
      stripeSubscriptionId: 'sub_test',
    });
    p.licenseActivation.upsert.mockResolvedValue({});

    const body = Buffer.from(JSON.stringify({ id: 'evt_test_1' }));
    const first = await request(app)
      .post('/v1/webhooks/stripe')
      .set('Stripe-Signature', 't=1,v1=test')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(p.communitySite.create).toHaveBeenCalled();
    expect(p.license.create).toHaveBeenCalled();

    const second = await request(app)
      .post('/v1/webhooks/stripe')
      .set('Stripe-Signature', 't=1,v1=test')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(p.communitySite.create).toHaveBeenCalledTimes(1);
  });
});
