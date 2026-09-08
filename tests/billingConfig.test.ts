import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
const { db, price } = vi.hoisted(() => ({
  db: { billingConfig: { findUnique: vi.fn(), upsert: vi.fn() } }, price: vi.fn(),
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));
vi.mock('../src/services/stripeClient.js', () => ({ getStripe: () => ({ prices: { retrieve: price } }) }));
import { defaultBillingConfig, getBillingConfig, saveBillingConfig } from '../src/services/billingConfigService.js';
import { createApp } from '../src/app.js';
const app = createApp();
const settings = { ...defaultBillingConfig, monthlyPriceId: 'price_monthly', monthlyAmount: 1900, monthlyEnabled: true, trialDays: 14 };
beforeEach(() => {
  vi.clearAllMocks();
  db.billingConfig.findUnique.mockResolvedValue({ id: 1, updatedAt: new Date(), ...settings });
  price.mockResolvedValue({ active: true, currency: 'usd', unit_amount: 1900, billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } });
  db.billingConfig.upsert.mockImplementation(async ({ update }) => update);
});
describe('central plans and trials', () => {
  it('validates Stripe amount and interval before saving', async () => {
    await saveBillingConfig(settings); expect(db.billingConfig.upsert).toHaveBeenCalledOnce();
    price.mockResolvedValue({ active: true, currency: 'usd', unit_amount: 2900, recurring: { interval: 'year' } });
    await expect(saveBillingConfig(settings)).rejects.toThrow('must match');
    expect(db.billingConfig.upsert).toHaveBeenCalledOnce();
  });
  it('rejects invalid durations and missing Price IDs without writing', async () => {
    for (const input of [{ ...settings, trialDays: -1 }, { ...settings, failureGraceDays: 31 }, { ...settings, monthlyPriceId: '' }]) {
      await expect(saveBillingConfig(input)).rejects.toThrow();
    }
    expect(db.billingConfig.upsert).not.toHaveBeenCalled();
  });
  it('disables purchase options until configured and does not leak model metadata', async () => {
    expect(await getBillingConfig()).toEqual(settings);
    db.billingConfig.findUnique.mockResolvedValue(null);
    expect((await getBillingConfig()).monthlyEnabled).toBe(false);
  });
  it('updates website amounts and trial copy on the next request without restart', async () => {
    let res = await request(app).get('/').expect(200);
    expect(res.text).toContain('$19.00/month'); expect(res.text).toContain('14-day');
    expect(res.text).not.toContain('$29/mo'); expect(res.headers['cache-control']).toBe('no-store');
    db.billingConfig.findUnique.mockResolvedValue({ id: 1, updatedAt: new Date(), ...settings, monthlyEnabled: false, annualEnabled: true, annualPriceId: 'price_year', annualAmount: 9900, trialDays: 0 });
    res = await request(app).get('/').expect(200);
    expect(res.text).toContain('$99.00/year'); expect(res.text).not.toContain('free trial');
    res = await request(app).get('/checkout').expect(200);
    expect(res.text).toContain('value="annual"'); expect(res.text).not.toContain('value="monthly"');
  });
  it('requires admin auth for configuration and reconciliation', async () => {
    await request(app).get('/v1/admin/billing/config').expect(401);
    await request(app).put('/v1/admin/billing/config').send(settings).expect(401);
    await request(app).post('/v1/admin/billing/reconcile').send({}).expect(401);
    const res = await request(app).get('/v1/admin/billing/config').set('Authorization', 'Bearer test-admin-token-static-value-for-ci').expect(200);
    expect(res.body.settings.trialDays).toBe(14);
  });
});
