import Stripe from 'stripe';
import { config, isStripeCheckoutConfigured, isStripeWebhookConfigured } from '../config.js';
import { serviceUnavailable } from '../lib/errors.js';

let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw serviceUnavailable('CHECKOUT_NOT_CONFIGURED', 'Stripe is not configured');
  }
  if (!client) {
    client = new Stripe(config.stripeSecretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }
  return client;
}

export function requireStripeCheckout() {
  if (!isStripeCheckoutConfigured()) {
    throw serviceUnavailable(
      'CHECKOUT_NOT_CONFIGURED',
      'Stripe Checkout is not connected yet. Contact support for early Pro access.',
    );
  }
  return getStripe();
}

export function requireStripeWebhook() {
  if (!isStripeWebhookConfigured()) {
    throw serviceUnavailable(
      'CHECKOUT_NOT_CONFIGURED',
      'Stripe webhooks are not configured',
    );
  }
  return getStripe();
}

export function resetStripeClientForTests() {
  client = undefined;
}
