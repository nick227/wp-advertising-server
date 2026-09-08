import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { getStripe } from './stripeClient.js';

const priceId = z.string().trim().max(255).refine((v) => !v || /^price_[a-zA-Z0-9_]+$/.test(v), 'Invalid Stripe Price ID');
export const billingConfigSchema = z.object({
  monthlyPriceId: priceId,
  annualPriceId: priceId,
  monthlyAmount: z.number().int().min(0).max(100000000),
  annualAmount: z.number().int().min(0).max(100000000),
  monthlyEnabled: z.boolean(),
  annualEnabled: z.boolean(),
  trialDays: z.number().int().min(0).max(365),
  failureGraceDays: z.number().int().min(0).max(30),
}).strict().superRefine((value, ctx) => {
  for (const plan of ['monthly', 'annual'] as const) {
    if (value[`${plan}Enabled`] && (!value[`${plan}PriceId`] || value[`${plan}Amount`] <= 0)) {
      ctx.addIssue({ code: 'custom', path: [`${plan}PriceId`], message: `Enabled ${plan} plan requires a Price ID and positive amount` });
    }
  }
});
export type PlansConfig = z.infer<typeof billingConfigSchema>;
export const defaultBillingConfig: PlansConfig = {
  monthlyPriceId: '', annualPriceId: '', monthlyAmount: 2900, annualAmount: 0,
  monthlyEnabled: false, annualEnabled: false, trialDays: 30, failureGraceDays: 3,
};

export async function getBillingConfig(db: Pick<Prisma.TransactionClient, 'billingConfig'> = prisma): Promise<PlansConfig> {
  const row = await db.billingConfig.findUnique({ where: { id: 1 } });
  if (!row) return { ...defaultBillingConfig, monthlyPriceId: config.stripePriceMonthly, annualPriceId: config.stripePriceAnnual };
  const { id: _id, updatedAt: _updatedAt, ...settings } = row;
  return settings;
}

export async function verifyPlanPrice(settings: PlansConfig, plan: 'monthly' | 'annual') {
  const price = await getStripe().prices.retrieve(settings[`${plan}PriceId`]);
  if (!price.active || price.currency !== 'usd' || price.unit_amount !== settings[`${plan}Amount`]
    || price.recurring?.interval !== (plan === 'monthly' ? 'month' : 'year')
    || price.recurring.interval_count !== 1 || price.billing_scheme !== 'per_unit'
    || price.recurring.usage_type !== 'licensed' || price.transform_quantity) {
    throw badRequest(`${plan} price must match the configured USD amount and billing interval in Stripe`);
  }
  return price;
}

export async function saveBillingConfig(input: unknown) {
  const settings = billingConfigSchema.parse(input);
  for (const plan of ['monthly', 'annual'] as const) {
    if (settings[`${plan}Enabled`]) await verifyPlanPrice(settings, plan);
  }
  return prisma.billingConfig.upsert({ where: { id: 1 }, create: { id: 1, ...settings }, update: settings });
}

export function planChoices(settings: PlansConfig) {
  return (['monthly', 'annual'] as const).filter((plan) => settings[`${plan}Enabled`]).map((plan) => ({
    plan,
    label: `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(settings[`${plan}Amount`] / 100)}/${plan === 'monthly' ? 'month' : 'year'}`,
  }));
}

// Bootstrap existing deployments from Stripe once; subsequent reads use SQL only.
export async function initializeBillingConfig() {
  if (await prisma.billingConfig.findUnique({ where: { id: 1 } })) return;
  const settings = { ...defaultBillingConfig };
  for (const plan of ['monthly', 'annual'] as const) {
    const id = plan === 'monthly' ? config.stripePriceMonthly : config.stripePriceAnnual;
    if (!id) continue;
    const price = await getStripe().prices.retrieve(id);
    settings[`${plan}PriceId`] = id;
    settings[`${plan}Amount`] = price.unit_amount ?? 0;
    settings[`${plan}Enabled`] = true;
    await verifyPlanPrice(settings, plan);
  }
  await prisma.billingConfig.upsert({ where: { id: 1 }, create: { id: 1, ...settings }, update: {} });
}
