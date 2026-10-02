# House of Briar

A full-stack storefront prototype with a protected designer portal, validated multi-photo uploads, a public published-only gallery, guest shopping tools, and a Stripe Checkout integration that is restricted to test mode. The storefront and designer workspace use the same SQLite-backed listing store.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm start
```

Then open <http://localhost:3000>.

## Customer shopping

- Customers can browse published, approved products without an account or login.
- Search, category filters, and sorting work against the public gallery.
- The guest bag is saved in the browser's local storage, with quantity controls and item removal.
- Product availability is shown publicly. Only items marked in stock with quantity remaining, or made to order with a lead-time note, can be added to checkout.
- New listings cannot be submitted or approved for publication without at least one photo, a positive price, a 20-character product description, and a confirmed availability state. Checkout also revalidates those requirements for older records.
- Customers can report a product detail, image, or availability issue. Reports are rate-limited and visible only to an administrator.
- Shipping rate/destinations, delivery estimate, returns/refunds, and support contact details are shown in the bag before any payment step.

Customer accounts are not required. Drafts, moderation data, designer tools, report review, and paid order records remain protected by designer/admin authorization.

## Stripe test checkout

Checkout is **test mode only**. The server accepts only a Stripe `sk_test_` or `rk_test_` secret key; it never creates a Checkout Session using a live key. No live payment has been enabled or submitted. Checkout remains disabled unless Stripe test credentials, a matching test webhook secret, the public store URL, currency, flat shipping settings, delivery estimate, returns/refunds terms, and at least one customer support contact are all configured.

Set these values in the local `.env` or the deployment environment. Do not commit secret values:

- `STRIPE_SECRET_KEY` — test-mode secret key only (`sk_test_…` or `rk_test_…`).
- `STRIPE_WEBHOOK_SECRET` — test endpoint/Stripe CLI signing secret (`whsec_…`); use the matching test-mode webhook endpoint.
- `STORE_PUBLIC_URL` and `STORE_CURRENCY` — the HTTPS storefront origin and three-letter ISO currency code.
- `SHIPPING_AMOUNT_CENTS`, `SHIPPING_DISPLAY_NAME`, `SHIPPING_ALLOWED_COUNTRIES`, `SHIPPING_MIN_BUSINESS_DAYS`, and `SHIPPING_MAX_BUSINESS_DAYS` — the flat per-order shipping offer and estimate. Allowed countries are comma-separated ISO country codes.
- `RETURNS_POLICY_TEXT` — the customer-facing returns/refunds terms.
- `SUPPORT_EMAIL` or `SUPPORT_PHONE` — a customer contact method.

The server re-reads current product prices and availability; it does not trust client-supplied prices. In-stock quantities are reserved while a Checkout Session is open and restored when an expired or failed session webhook is received. Stripe webhook signatures are verified against the raw request body. A successful return page alone does not mark an order paid; the signed webhook does. Only card payments are enabled in this test flow.

To test webhooks locally, install and authenticate the Stripe CLI, run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and put its test signing secret in `STRIPE_WEBHOOK_SECRET`. Use Stripe's documented test card numbers in Stripe's hosted test Checkout only; never use real card details in a test flow.

## Designer and admin operations

### Designer flow

1. Open the Designer portal.
2. Sign in with a token from `DESIGNER_TOKENS_JSON` in `.env`.
3. Add or edit a draft, upload photos, set its price/category, and declare availability/stock or a made-to-order lead-time note.
4. Save and submit. With review enabled, the listing remains hidden until an admin approves it.
5. Use each listing's availability controls to update stock and lead-time information.

### Admin flow

Use the configured `ADMIN_TOKEN` as a Bearer token for moderation, report review, and the paid guest order queue. Paid order records include the customer email and shipping details needed for fulfillment; protect `.data/`, backups, and database access accordingly.

## API summary

- `GET /api/store-config` — public customer-facing store policies and whether checkout is configured.
- `GET /api/gallery` — guest-accessible published/approved products only; omits internal designer/moderation metadata.
- `POST /api/checkout/session` — creates a test-mode hosted Checkout Session from server-priced published products.
- `GET /api/checkout/session-status/:sessionId` — returns a minimal status for a test Checkout Session.
- `POST /api/stripe/webhook` — verifies Stripe test webhook signatures and updates order/inventory state.
- `POST /api/reports` — submit a rate-limited guest product issue report.
- `GET /api/my/listings` — authenticated designer listings.
- `POST /api/listings` — create a draft with an idempotency key.
- `PUT /api/listings/:id` — edit a draft/rejected listing.
- `PUT /api/listings/:id/availability` — owner-only availability and stock update.
- `POST /api/listings/:id/images` — upload one image at a time.
- `PUT /api/listings/:id/images/order` — reorder the assigned images.
- `DELETE /api/listings/:id/images/:imageId` — remove an image.
- `POST /api/listings/:id/submit` — submit for review or publish.
- `POST /api/admin/listings/:id/approve` — admin approval.
- `POST /api/admin/listings/:id/reject` — admin rejection.
- `POST /api/admin/listings/:id/unpublish` — archive a public listing.
- `GET /api/admin/reports` and `POST /api/admin/reports/:reportId/resolve` — protected report review.
- `GET /api/admin/orders` — protected paid/pending/expired order queue.

## Data and privacy notes

Listings, reports, checkout orders, and uploaded images are stored under `.data/`. Guest cart contents stay in the customer's browser until they begin checkout. Stripe handles card entry; this application does not store card numbers. The order database stores only the customer email and shipping details needed for fulfillment after a verified paid event. Apply appropriate access controls, backups, and retention practices to `.data/`.

## Validation

```bash
npm test
```
