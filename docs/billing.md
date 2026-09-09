# Billing operations

Admin → **Plans & Trials** (`/billing`) controls enabled monthly/annual plans, Stripe Price IDs, USD amounts, new-trial days, and payment-failure grace days. Amounts are entered in dollars and stored in cents. Enabled prices are checked against Stripe when saved and at checkout. One-time purchases are reserved for a future implementation and cannot be enabled.

Website pricing, checkout and new trials use this configuration. Existing subscriptions keep their purchased Stripe Price and snapshotted grace policy; existing trials keep their original end date. Changing a price means creating a new Stripe Price and selecting it here. Customer and subscription management stays in Stripe.

## Deployment

Deploy the server and admin from the monorepo after running the checks below. Server startup must run `npm run prisma:deploy` before serving traffic, and its build must run `npm run prisma:generate` before compilation. Keep the existing plugin ZIP build/release automation.

Pending installations need the billing-controls, customer-locks and site-owner-email migrations. The latter adds the `ownerEmail` column already present in the schema. Do not substitute `db push` for deployment migrations.

Set server `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `PUBLIC_SITE_URL`. Keep Stripe keys and Price IDs in the same test/live mode. Legacy `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` values are imported only when initializing a missing BillingConfig row; subsequent edits belong in Plans & Trials.

Configure the Stripe webhook endpoint at `/v1/webhooks/stripe` with API version `2025-02-24.acacia`, matching the pinned SDK client, for:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`
- `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

## Recovery and expiry

Use Plans & Trials → reconciliation with a subscription ID for one repair, or process each batch of ten using the next-page action. This scans Stripe subscriptions, so it can recover a missing checkout webhook even without an existing local license. Inspect returned errors and retry repaired items.

Synchronization locks per customer and reads current Stripe state before committing license, site eligibility and webhook receipt atomically. Duplicate delivery is safe. Failed renewal grace has a fixed deadline; retries do not extend it. Payment recovery clears grace. Cancellation and expiry remove access.

Billing updates durable eligibility and invalidates the rotation cache. Ad serving reads cached eligibility and its deadline only; it never calls Stripe, reads billing configuration or checks a live license. The expiry sweep runs every ten minutes, while cached deadlines deny access immediately at expiry.

The plugin schedules hourly entitlement refresh through WP-Cron, including recovery of expired entitlements. WP-Cron needs site traffic or an external cron runner. Offline access cannot outlive the server-issued deadline.

## Verification

From the monorepo root:

```sh
npm run check
npm run test:billing:mysql
npm run build
npm --prefix wp-advertising-admin run build
npm --prefix wp-advertising-admin test
php wp-advertising/tests/test-license-refresh.php
```

The MySQL test requires a local database account that can create/drop databases. It creates an isolated temporary database, applies all migrations, tests concurrent duplicate delivery, transaction rollback and expiry, then removes that database. Stripe is mocked; no payments are made.

Before enabling live sales, verify a Stripe test-mode checkout, monthly and annual renewal, failure/retry with a fixed grace deadline, recovery, cancellation, duplicate delivery, and missed-checkout reconciliation against the deployed services. Confirm the plugin refreshes its entitlement and expired sites stop receiving network ads. Automated tests do not replace this deployment check.
