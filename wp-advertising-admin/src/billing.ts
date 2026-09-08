import { escapeHtml } from './layout.js';

export type PlansConfig = {
  monthlyPriceId: string; annualPriceId: string;
  monthlyAmount: number; annualAmount: number;
  monthlyEnabled: boolean; annualEnabled: boolean;
  trialDays: number; failureGraceDays: number;
};
export type Reconciliation = {
  results: Array<{ subscriptionId?: string; licenseId?: string; status?: string; ignored?: boolean; error?: string }>;
  nextCursor: string | null;
};

export function billingBody(settings: PlansConfig, reconciliation?: Reconciliation): string {
  return `<h1>Plans &amp; Trials</h1>
  <p>Amounts are USD. Enabled plans must match their Stripe Price exactly. Create a new Price in Stripe to change what new customers pay.</p>
  <form method="post" action="/billing/config" class="panel" style="display:grid;gap:1rem;max-width:42rem">
    ${(['monthly', 'annual'] as const).map((plan) => `<fieldset>
      <legend>Premium ${plan}</legend>
      <label><input type="checkbox" name="${plan}Enabled" value="1"${settings[`${plan}Enabled`] ? ' checked' : ''}> Available for purchase</label>
      <label>Stripe Price ID <input name="${plan}PriceId" value="${escapeHtml(settings[`${plan}PriceId`])}" placeholder="price_..."></label>
      <label>Amount (USD) <input type="number" name="${plan}Amount" min="0" max="1000000" step="0.01" required value="${(settings[`${plan}Amount`] / 100).toFixed(2)}"></label>
    </fieldset>`).join('')}
    <label>Trial length (days; 0 disables new trials)
      <input type="number" name="trialDays" min="0" max="365" required value="${settings.trialDays}"></label>
    <label>Payment-failure grace (days; 0 means no grace)
      <input type="number" name="failureGraceDays" min="0" max="30" required value="${settings.failureGraceDays}"></label>
    <p>Changes apply to new purchases and trials. Existing prices, trial deadlines, and subscription grace policies remain unchanged.</p>
    <button type="submit">Save plans and trial settings</button>
  </form>
  <h2>Resync billing from Stripe</h2>
  <p>Updates license access only; does not charge customers or change subscriptions. Leave the ID blank to scan 10 Stripe subscriptions at a time.</p>
  <form method="post" action="/billing/reconcile">
    <label>Subscription ID (optional) <input name="subscriptionId" placeholder="sub_..."></label>
    <button type="submit">Resync from Stripe</button>
  </form>
  ${reconciliation ? `<ul>${reconciliation.results.map((row) => `<li>${escapeHtml(row.subscriptionId || row.licenseId || 'Subscription')}: ${escapeHtml(row.error || (row.ignored ? 'Unrelated subscription skipped' : row.status || 'Synced'))}</li>`).join('')}</ul>
    ${reconciliation.nextCursor ? `<form method="post" action="/billing/reconcile"><input type="hidden" name="startingAfter" value="${escapeHtml(reconciliation.nextCursor)}"><button type="submit">Sync next 10</button></form>` : '<p>Scan complete.</p>'}` : ''}`;
}

export function parseBillingForm(body: Record<string, unknown>): PlansConfig {
  function number(name: string, money = false) {
    const value = String(body[name] ?? '').trim();
    if (!(money ? /^\d+(\.\d{1,2})?$/ : /^\d+$/).test(value)) throw new Error(`Enter a valid ${name} value`);
    return money ? Math.round(Number(value) * 100) : Number(value);
  }
  return {
    monthlyPriceId: String(body.monthlyPriceId ?? '').trim(), annualPriceId: String(body.annualPriceId ?? '').trim(),
    monthlyAmount: number('monthlyAmount', true), annualAmount: number('annualAmount', true),
    monthlyEnabled: body.monthlyEnabled === '1', annualEnabled: body.annualEnabled === '1',
    trialDays: number('trialDays'), failureGraceDays: number('failureGraceDays'),
  };
}
