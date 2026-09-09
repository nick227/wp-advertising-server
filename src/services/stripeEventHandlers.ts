import type Stripe from 'stripe';
import { Prisma, type License } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { normalizeDomain, normalizeSiteUrl } from '../lib/urlUtils.js';
import { stripeRefId } from './billingService.js';
import { getStripe } from './stripeClient.js';
import { getBillingConfig } from './billingConfigService.js';
import { rotationCache } from './rotationCache.js';
import { config } from '../config.js';

const DAY = 86400000;
const supportedEvents = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed',
]);

export function subscriptionIdForEvent(event: Stripe.Event): string | undefined {
  if (!supportedEvents.has(event.type)) return undefined;
  if (event.type.startsWith('customer.subscription.')) return (event.data.object as Stripe.Subscription).id;
  return stripeRefId((event.data.object as Stripe.Invoice | Stripe.Checkout.Session).subscription);
}

// Grace is anchored to the first unpaid renewal, never the webhook receipt/retry time.
export function billingWindow(subscription: Stripe.Subscription, paidThrough: Date | null,
  existing: Pick<License, 'graceUntil' | 'failureInvoiceId'> | null, graceDays: number, now = new Date()) {
  const invoice = typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null;
  const terminal = !['active', 'past_due', 'trialing'].includes(subscription.status) || Boolean(subscription.pause_collection);
  const paid = paidThrough?.getTime() ?? 0;
  const failing = !terminal && invoice && invoice.status === 'open' && invoice.attempted && !invoice.paid;
  let graceUntil: Date | null = null;
  let failureInvoiceId: string | null = null;
  if (failing && paid > 0) {
    failureInvoiceId = invoice.id;
    // Preserve an ongoing delinquency even if Stripe generates another unpaid invoice.
    graceUntil = existing?.graceUntil && paid <= existing.graceUntil.getTime()
      ? existing.graceUntil
      : new Date(Math.max(paid, (invoice.status_transitions?.finalized_at ?? invoice.created ?? paid / 1000) * 1000) + graceDays * DAY);
  }
  const expiresAt = new Date(terminal ? Math.min(paid, subscription.ended_at ? subscription.ended_at * 1000 : now.getTime())
    : Math.max(paid, graceUntil?.getTime() ?? 0));
  const status = terminal || expiresAt <= now ? 'EXPIRED' as const : 'ACTIVE' as const;
  return { status, expiresAt, paidThrough, graceUntil, failureInvoiceId };
}

async function syncSubscription(db: Prisma.TransactionClient, subscriptionId: string, customerId: string | undefined, expectedSiteId?: string) {
  const stripe = getStripe();
  // Fetched under the DB lock: delayed events cannot overwrite a newer snapshot.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  if (stripeRefId(subscription.customer) !== customerId) throw badRequest('Subscription customer changed; retry synchronization');
  if (expectedSiteId && subscription.metadata.siteId !== expectedSiteId) throw forbidden('Subscription does not belong to this site');
  let license = await db.license.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  const settings = await getBillingConfig(db);
  const acceptedPrices = [settings.monthlyPriceId, settings.annualPriceId, config.stripePriceMonthly, config.stripePriceAnnual].filter(Boolean);
  const owned = subscription.metadata.application === 'wp-advertising'
    || subscription.items.data.some((item) => acceptedPrices.includes(item.price.id));
  if (!license && (!owned || (!subscription.metadata.siteUrl && !subscription.metadata.siteId))) return { ignored: true };

  const invoices = await stripe.invoices.list({ subscription: subscriptionId, status: 'paid', limit: 1 });
  const invoice = invoices.data[0];
  const ends = (invoice?.lines.data ?? []).filter((line) => line.type === 'subscription')
    .map((line) => line.period.end).filter((end) => Number.isFinite(end) && end > 0);
  // Never grant a new period merely because a renewal invoice was created.
  const paidThrough = ends.length ? new Date(Math.min(Math.max(...ends), subscription.current_period_end) * 1000) : null;
  if (paidThrough && !Number.isFinite(paidThrough.getTime())) throw badRequest('Invalid subscription billing period');
  const metadataGrace = Number(subscription.metadata.failureGraceDays);
  const graceDays = license?.failureGraceDays ?? (subscription.metadata.failureGraceDays !== undefined
    && Number.isInteger(metadataGrace) && metadataGrace >= 0 && metadataGrace <= 30 ? metadataGrace : settings.failureGraceDays);
  const window = billingWindow(subscription, paidThrough, license, graceDays);
  const now = new Date();
  if (!license) {
    let site = null;
    const siteUrl = subscription.metadata.siteUrl ? normalizeSiteUrl(subscription.metadata.siteUrl) : '';
    const siteDomain = siteUrl ? normalizeDomain(new URL(siteUrl).hostname) : '';

    if (subscription.metadata.siteId) {
      site = await db.communitySite.findUnique({ where: { id: subscription.metadata.siteId } });
    }

    if (!site && siteUrl) {
      site = await db.communitySite.findFirst({ where: { OR: [{ siteUrl }, { siteDomain }] } });
      const ownerEmail = invoice?.customer_email?.toLowerCase() ?? undefined;
      if (!site) {
        site = await db.communitySite.create({ data: { siteUrl, siteDomain, publicKey: `pub_${nanoid(32)}`, ownerEmail, lastSeenAt: now } });
      } else if (ownerEmail && !site.ownerEmail) {
        site = await db.communitySite.update({ where: { id: site.id }, data: { ownerEmail } });
      }
    }

    if (!site) {
      throw badRequest('Cannot bind license: missing site URL or site ID');
    }

    license = await db.license.create({ data: {
      licenseKey: `lic_${nanoid(32)}`, stripeSubscriptionId: subscriptionId,
      stripeCustomerId: stripeRefId(subscription.customer), customerEmail: invoice?.customer_email,
      failureGraceDays: graceDays, stripeSyncedAt: now, ...window,
    } });
    await db.licenseActivation.create({ data: { licenseId: license.id, siteId: site.id, domainSnapshot: site.siteDomain, lastValidatedAt: now } });
  } else {
    license = await db.license.update({ where: { id: license.id }, data: {
      ...window,
      // Billing must not undo an explicit license revocation/suspension.
      status: license.status === 'REVOKED' ? license.status : window.status,
      stripeCustomerId: stripeRefId(subscription.customer), failureGraceDays: graceDays, stripeSyncedAt: now,
    } });
  }
  const activations = await db.licenseActivation.findMany({ where: { licenseId: license.id, deactivatedAt: null } });
  for (const activation of [...activations].sort((a, b) => a.siteId.localeCompare(b.siteId))) {
    await db.$queryRaw`SELECT id FROM CommunitySite WHERE id = ${activation.siteId} FOR UPDATE`;
    const site = await db.communitySite.findUnique({ where: { id: activation.siteId } });
    if (!site || site.networkStatus === 'REVOKED' || site.networkStatus === 'SUSPENDED') continue;
    // Another valid license must survive cancellation of an older subscription.
    const valid = await db.licenseActivation.findMany({ where: {
      siteId: site.id, deactivatedAt: null, license: { status: 'ACTIVE', expiresAt: { gt: now } },
    }, include: { license: true } });
    const until = valid.reduce((end, item) => Math.max(end, item.license.expiresAt?.getTime() ?? 0), 0);
    if (until) {
      await db.communitySite.update({ where: { id: site.id }, data: { networkStatus: 'ACTIVE', networkAccessUntil: new Date(until) } });
    } else if (!(site.networkStatus === 'TRIAL' && site.networkAccessUntil && site.networkAccessUntil > now)) {
      await db.communitySite.update({ where: { id: site.id }, data: { networkStatus: 'EXPIRED', networkAccessUntil: now } });
    }
  }
  return { licenseId: license.id, status: license.status, expiresAt: license.expiresAt, affectedSiteIds: activations.map((activation) => activation.siteId) };
}

export async function synchronizeStripe(subscriptionId: string, event?: Stripe.Event, expectedSiteId?: string) {
  // Stripe customer identity is stable. Reconciliation looks it up; signed events
  // already include it. Subscription state is always fetched again under the lock.
  const eventCustomer = event && stripeRefId((event.data.object as Stripe.Subscription).customer);
  const customerId = eventCustomer || stripeRefId((await getStripe().subscriptions.retrieve(subscriptionId)).customer);
  const lockId = customerId ? `customer:${customerId}` : `subscription:${subscriptionId}`;
  await prisma.billingSyncLock.upsert({ where: { id: lockId }, create: { id: lockId }, update: {} });
  const result = await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM BillingSyncLock WHERE id = ${lockId} FOR UPDATE`;
    if (event && await db.stripeEvent.findUnique({ where: { id: event.id } })) {
      const license = await db.license.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
      const activations = license ? await db.licenseActivation.findMany({ where: { licenseId: license.id, deactivatedAt: null } }) : [];
      return { duplicate: true, affectedSiteIds: activations.map((activation) => activation.siteId) };
    }
    const synced = await syncSubscription(db, subscriptionId, customerId, expectedSiteId);
    // This commits atomically with all license and site changes; errors roll it all back.
    if (event) await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
    return synced;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 45000 });
  await rotationCache.invalidate('affectedSiteIds' in result ? result.affectedSiteIds : []);
  return result;
}

export async function dispatchStripeEvent(event: Stripe.Event) {
  const subscriptionId = subscriptionIdForEvent(event);
  return subscriptionId ? synchronizeStripe(subscriptionId, event) : { ignored: true };
}

export async function reconcileStripe(input: { subscriptionId?: string; startingAfter?: string }) {
  if (input.subscriptionId) return { results: [await synchronizeStripe(input.subscriptionId)], nextCursor: null };
  // Scan Stripe, not just local licenses: this also repairs a missed initial checkout webhook.
  const page = await getStripe().subscriptions.list({ status: 'all', limit: 10, starting_after: input.startingAfter });
  const results = [];
  for (const subscription of page.data) {
    try { results.push({ subscriptionId: subscription.id, ...await synchronizeStripe(subscription.id) }); }
    catch (error) { results.push({ subscriptionId: subscription.id, error: error instanceof Error ? error.message : 'Sync failed' }); }
  }
  return { results, nextCursor: page.has_more ? page.data.at(-1)?.id ?? null : null };
}
