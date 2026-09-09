import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { signToken } from '../src/auth.js';
import { parseBillingForm } from '../src/billing.js';
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
import { createApp } from '../src/app.js';
const app = createApp();
const cookie = `wpa_admin_session=${signToken('test-admin-token')}`;
const settings = { monthlyPriceId: 'price_monthly', annualPriceId: '', monthlyAmount: 1900, annualAmount: 0,
  monthlyEnabled: true, annualEnabled: false, trialDays: 14, failureGraceDays: 3 };
const form = { monthlyPriceId: 'price_monthly', annualPriceId: '', monthlyAmount: '19.95', annualAmount: '0',
  monthlyEnabled: '1', trialDays: '14', failureGraceDays: '3' };
function response(body: unknown, status = 200) { return { ok: status < 400, status, text: async () => JSON.stringify(body) }; }
beforeEach(() => fetchMock.mockReset());
describe('Plans & Trials', () => {
  it('requires authentication', async () => {
    await request(app).get('/billing').expect(302); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('renders server-owned settings and posts dollar amounts as integer cents', async () => {
    fetchMock.mockResolvedValue(response({ settings }));
    const page = await request(app).get('/billing').set('Cookie', cookie).expect(200);
    expect(page.text).toContain('Plans &amp; Trials'); expect(page.text).toContain('value="14"');
    await request(app).post('/billing/config').set('Cookie', cookie).type('form').send(form).expect(303);
    const init = fetchMock.mock.calls[1][1];
    expect(init.method).toBe('PUT'); expect(JSON.parse(init.body).monthlyAmount).toBe(1995);
    expect(JSON.parse(init.body).annualEnabled).toBe(false);
  });
  it('rejects imprecise amounts before calling the server', () => {
    expect(() => parseBillingForm({ ...form, monthlyAmount: '1.999' })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('shows Stripe configuration errors to the operator', async () => {
    fetchMock.mockResolvedValue(response({ error: { message: 'monthly price must match Stripe' } }, 400));
    const res = await request(app).post('/billing/config').set('Cookie', cookie).type('form').send(form).expect(303);
    expect(res.headers['set-cookie'].join(';')).toContain('monthly%20price%20must%20match%20Stripe');
  });
  it('runs reconciliation and offers the next bounded page', async () => {
    fetchMock.mockResolvedValueOnce(response({ results: [{ subscriptionId: 'sub_1', status: 'ACTIVE' }], nextCursor: 'sub_1' }))
      .mockResolvedValueOnce(response({ settings }));
    const res = await request(app).post('/billing/reconcile').set('Cookie', cookie).type('form').send({}).expect(200);
    expect(res.text).toContain('Sync next 10'); expect(res.text).toContain('sub_1');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/billing/reconcile');
  });
});
