import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { claimStripeEvent, releaseStripeEvent } from '../services/billingService.js';
import { dispatchStripeEvent } from '../services/stripeEventHandlers.js';
import { requireStripeWebhook } from '../services/stripeClient.js';

export const stripeWebhookHandler: RequestHandler = async (req, res, next) => {
  try {
    const stripe = requireStripeWebhook();
    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Missing Stripe-Signature header' } });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Webhook body must be raw bytes' } });
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
    } catch {
      res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid Stripe webhook signature' } });
      return;
    }

    const claimed = await claimStripeEvent(event.id, event.type);
    if (!claimed) {
      res.json({ ok: true, duplicate: true });
      return;
    }

    try {
      await dispatchStripeEvent(event);
    } catch (error) {
      await releaseStripeEvent(event.id);
      throw error;
    }

    res.json({ ok: true, received: true });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    next(error);
  }
};
