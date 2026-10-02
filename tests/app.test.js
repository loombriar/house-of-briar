const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { once } = require('node:events');
const sharp = require('sharp');
const { createApp } = require('../server');

const DESIGNER_TOKEN = 'designer-token-a';
const OTHER_DESIGNER_TOKEN = 'designer-token-b';
const ADMIN_TOKEN = 'admin-token';

let server;
let context;
let baseUrl;
let tempDir;
let stripeCalls;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-of-briar-test-'));
  stripeCalls = [];
  let sessionCounter = 0;
  const fakeStripe = {
    checkout: {
      sessions: {
        create: async (params, requestOptions) => {
          stripeCalls.push({ params, requestOptions });
          sessionCounter += 1;
          const id = `cs_test_session_${sessionCounter}`;
          return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
        }
      }
    },
    webhooks: {
      constructEvent: (rawBody, signature, secret) => {
        if (!Buffer.isBuffer(rawBody) || signature !== 'test-signature' || secret !== 'whsec_test_fixture') throw new Error('invalid signature');
        return JSON.parse(rawBody.toString('utf8'));
      }
    }
  };
  context = createApp({
    dataDir: tempDir,
    seedProducts: [],
    designerTokens: {
      [DESIGNER_TOKEN]: 'designer-a',
      [OTHER_DESIGNER_TOKEN]: 'designer-b'
    },
    adminToken: ADMIN_TOKEN,
    reviewRequired: true,
    stripe: fakeStripe,
    stripeTestMode: true,
    webhookSecret: 'whsec_test_fixture',
    storeConfig: {
      currency: 'usd',
      publicUrl: 'https://shop.example.test',
      shippingAmountCents: 500,
      shippingDisplayName: 'Standard shipping',
      shippingCountries: ['US'],
      shippingMinimumDays: 3,
      shippingMaximumDays: 5,
      returnsPolicy: 'Test policy: returns accepted within 14 days of delivery.',
      supportEmail: 'support@example.test'
    }
  });
  server = context.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  context?.db.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

async function getJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  let body = {};
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

async function makePng(color) {
  return sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: color
    }
  }).png().toBuffer();
}

async function uploadImage(listingId, idempotencyKey, color) {
  const form = new FormData();
  form.append('image', new Blob([await makePng(color)], { type: 'image/png' }), `${idempotencyKey}.png`);
  return getJson(`/api/listings/${encodeURIComponent(listingId)}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Idempotency-Key': idempotencyKey
    },
    body: form
  });
}

test('serves the storefront HTML, stylesheet, and current frontend script from their expected routes', async () => {
  const page = await fetch(`${baseUrl}/`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/script\.js"/);
  assert.match(html, /view product details without an account/);
  assert.match(html, /Designer portal/);
  assert.match(html, /id="cart-open-btn"/);
  assert.match(html, /id="product-search"/);
  assert.match(html, /id="product-sort"/);
  assert.match(html, /id="report-form"/);

  const cssResponse = await fetch(`${baseUrl}/styles.css`);
  const css = await cssResponse.text();
  assert.equal(cssResponse.status, 200);
  assert.match(cssResponse.headers.get('content-type'), /text\/css/);
  assert.match(css, /\.site-header/);
  assert.doesNotMatch(css, /<!doctype html>/i);

  const jsResponse = await fetch(`${baseUrl}/script.js`);
  const js = await jsResponse.text();
  assert.equal(jsResponse.status, 200);
  assert.match(jsResponse.headers.get('content-type'), /javascript/);
  assert.match(js, /async function loadGallery/);
  assert.match(js, /async function uploadQueuedImages/);
});

test('health and gallery endpoints respond with the expected JSON shape', async () => {
  const health = await getJson('/api/health');
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, { ok: true });

  const gallery = await getJson('/api/gallery');
  assert.equal(gallery.response.status, 200);
  assert.deepEqual(gallery.body, { items: [] });

  const unauthorized = await getJson('/api/my/listings');
  assert.equal(unauthorized.response.status, 401);
});

test('supports multiple uploads, ordering, owner isolation, review gating, and publication', async () => {
  const created = await getJson('/api/listings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'listing-key-0001'
    },
    body: JSON.stringify({
      title: 'Test woven throw',
      description: 'A test listing with enough material and care details for shoppers.',
      price: 42.5,
      category: 'home'
    })
  });
  assert.equal(created.response.status, 201);
  const listingId = created.body.item.id;
  assert.equal(created.body.item.status, 'draft');
  assert.equal(created.body.item.availability, 'unknown');

  const invalidAvailability = await getJson(`/api/listings/${encodeURIComponent(listingId)}/availability`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ availability: 'in_stock' })
  });
  assert.equal(invalidAvailability.response.status, 422);

  const unauthorizedAvailability = await getJson(`/api/listings/${encodeURIComponent(listingId)}/availability`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availability: 'in_stock', stockQuantity: 2 })
  });
  assert.equal(unauthorizedAvailability.response.status, 401);

  const otherOwnerAvailability = await getJson(`/api/listings/${encodeURIComponent(listingId)}/availability`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${OTHER_DESIGNER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ availability: 'in_stock', stockQuantity: 2 })
  });
  assert.equal(otherOwnerAvailability.response.status, 404);

  const availabilityUpdated = await getJson(`/api/listings/${encodeURIComponent(listingId)}/availability`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ availability: 'in_stock', stockQuantity: 2 })
  });
  assert.equal(availabilityUpdated.response.status, 200);
  assert.equal(availabilityUpdated.body.item.stockQuantity, 2);

  const incomplete = await getJson('/api/listings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'listing-key-0002'
    },
    body: JSON.stringify({
      title: 'Unconfirmed sample',
      description: 'A detailed enough description for a sample item.',
      price: 12,
      category: 'home'
    })
  });
  assert.equal(incomplete.response.status, 201);
  await uploadImage(incomplete.body.item.id, 'image-key-0003', '#776655');
  const incompleteSubmit = await getJson(`/api/listings/${encodeURIComponent(incomplete.body.item.id)}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }
  });
  assert.equal(incompleteSubmit.response.status, 422);
  assert.equal(incompleteSubmit.body.error.code, 'listing_incomplete');
  assert.match(incompleteSubmit.body.error.message, /availability/i);

  const firstUpload = await uploadImage(listingId, 'image-key-0001', '#aa6655');
  assert.equal(firstUpload.response.status, 201);
  assert.equal(firstUpload.body.item.images.length, 1);

  const secondUpload = await uploadImage(listingId, 'image-key-0002', '#557766');
  assert.equal(secondUpload.response.status, 201);
  assert.equal(secondUpload.body.item.images.length, 2);
  const originalOrder = secondUpload.body.item.images.map((image) => image.id);

  const otherOwnerRead = await getJson(`/api/listings/${encodeURIComponent(listingId)}`, {
    headers: { Authorization: `Bearer ${OTHER_DESIGNER_TOKEN}` }
  });
  assert.equal(otherOwnerRead.response.status, 404);

  const privateImage = await fetch(`${baseUrl}${secondUpload.body.item.images[0].url}`, {
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }
  });
  assert.equal(privateImage.status, 200);
  assert.match(privateImage.headers.get('content-type'), /image\/webp/);

  const reorderedIds = [...originalOrder].reverse();
  const reordered = await getJson(`/api/listings/${encodeURIComponent(listingId)}/images/order`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${DESIGNER_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ imageIds: reorderedIds })
  });
  assert.equal(reordered.response.status, 200);
  assert.deepEqual(reordered.body.item.images.map((image) => image.id), reorderedIds);

  const submitted = await getJson(`/api/listings/${encodeURIComponent(listingId)}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DESIGNER_TOKEN}` }
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.item.status, 'pending_review');

  const hiddenGallery = await getJson('/api/gallery');
  assert.deepEqual(hiddenGallery.body.items, []);
  const hiddenMedia = await fetch(`${baseUrl}/media/${encodeURIComponent(reorderedIds[0])}`);
  assert.equal(hiddenMedia.status, 404);

  const approved = await getJson(`/api/admin/listings/${encodeURIComponent(listingId)}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.item.status, 'published');

  const publishedGallery = await getJson('/api/gallery');
  assert.equal(publishedGallery.response.status, 200);
  assert.equal(publishedGallery.body.items.length, 1);
  assert.equal(publishedGallery.body.items[0].title, 'Test woven throw');
  assert.deepEqual(publishedGallery.body.items[0].images.map((image) => image.id), reorderedIds);
  assert.equal(publishedGallery.body.items[0].availability, 'in_stock');
  assert.equal(publishedGallery.body.items[0].stockQuantity, 2);
  for (const field of ['designerId', 'status', 'moderationStatus', 'createdAt', 'updatedAt', 'publishedAt']) {
    assert.equal(Object.hasOwn(publishedGallery.body.items[0], field), false, `public gallery must not expose ${field}`);
  }
  assert.equal(Object.hasOwn(publishedGallery.body.items[0], 'price'), true);
  assert.equal(Object.hasOwn(publishedGallery.body.items[0], 'description'), true);

  const publicImage = await fetch(`${baseUrl}/media/${encodeURIComponent(reorderedIds[0])}`);
  assert.equal(publicImage.status, 200);
  assert.match(publicImage.headers.get('content-type'), /image\/webp/);

  const storeConfig = await getJson('/api/store-config');
  assert.equal(storeConfig.response.status, 200);
  assert.equal(storeConfig.body.checkoutEnabled, true);
  assert.equal(storeConfig.body.shipping.amountCents, 500);
  assert.equal(storeConfig.body.returnsPolicy, 'Test policy: returns accepted within 14 days of delivery.');
  assert.equal(Object.hasOwn(storeConfig.body, 'stripeSecretKey'), false);

  const checkoutPayload = { idempotencyKey: 'checkout-key-0001', items: [{ id: listingId, quantity: 1 }] };
  const checkout = await getJson('/api/checkout/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload)
  });
  assert.equal(checkout.response.status, 200);
  assert.match(checkout.body.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(stripeCalls.length, 1);
  assert.equal(stripeCalls[0].params.line_items[0].price_data.unit_amount, 4250);
  assert.equal(stripeCalls[0].params.shipping_options[0].shipping_rate_data.fixed_amount.amount, 500);
  assert.deepEqual(stripeCalls[0].params.shipping_address_collection.allowed_countries, ['US']);
  assert.equal(stripeCalls[0].requestOptions.idempotencyKey, checkoutPayload.idempotencyKey);

  const checkoutReplay = await getJson('/api/checkout/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload)
  });
  assert.equal(checkoutReplay.response.status, 200);
  assert.equal(checkoutReplay.body.sessionId, checkout.body.sessionId);
  assert.equal(stripeCalls.length, 1, 'idempotent retries should not create another Stripe Session');
  const stockReserved = await getJson('/api/gallery');
  assert.equal(stockReserved.body.items[0].stockQuantity, 1);

  const webhookEvent = (eventId, type, sessionId, orderId, paymentStatus) => ({
    id: eventId,
    type,
    data: { object: {
      id: sessionId,
      metadata: { orderId },
      payment_status: paymentStatus,
      customer_details: { email: 'buyer@example.test' },
      shipping_details: { name: 'Test Buyer', address: { country: 'US' } }
    } }
  });
  const firstOrder = context.db.prepare('SELECT id FROM checkout_orders WHERE stripe_session_id = ?').get(checkout.body.sessionId);
  const invalidWebhook = await getJson('/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'invalid' },
    body: JSON.stringify(webhookEvent('evt_invalid', 'checkout.session.completed', checkout.body.sessionId, firstOrder.id, 'paid'))
  });
  assert.equal(invalidWebhook.response.status, 400);
  const paidWebhookBody = JSON.stringify(webhookEvent('evt_paid_1', 'checkout.session.completed', checkout.body.sessionId, firstOrder.id, 'paid'));
  const paidWebhook = await getJson('/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: paidWebhookBody
  });
  assert.equal(paidWebhook.response.status, 200);
  await getJson('/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: paidWebhookBody
  });
  const paidStatus = await getJson(`/api/checkout/session-status/${encodeURIComponent(checkout.body.sessionId)}`);
  assert.equal(paidStatus.body.status, 'paid');

  const secondCheckout = await getJson('/api/checkout/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: 'checkout-key-0002', items: [{ id: listingId, quantity: 1 }] })
  });
  assert.equal(secondCheckout.response.status, 200);
  const noStock = await getJson('/api/checkout/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: 'checkout-key-0003', items: [{ id: listingId, quantity: 1 }] })
  });
  assert.equal(noStock.response.status, 409);
  const secondOrder = context.db.prepare('SELECT id FROM checkout_orders WHERE stripe_session_id = ?').get(secondCheckout.body.sessionId);
  const expiredWebhook = await getJson('/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify(webhookEvent('evt_expired_1', 'checkout.session.expired', secondCheckout.body.sessionId, secondOrder.id, 'unpaid'))
  });
  assert.equal(expiredWebhook.response.status, 200);
  const restoredStock = await getJson('/api/gallery');
  assert.equal(restoredStock.body.items[0].stockQuantity, 1);
  const expiredStatus = await getJson(`/api/checkout/session-status/${encodeURIComponent(secondCheckout.body.sessionId)}`);
  assert.equal(expiredStatus.body.status, 'expired');

  context.db.prepare("UPDATE listings SET status = 'published', moderation_status = 'approved' WHERE id = ?").run(incomplete.body.item.id);
  const legacyIncompleteCheckout = await getJson('/api/checkout/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: 'checkout-key-incomplete-001', items: [{ id: incomplete.body.item.id, quantity: 1 }] })
  });
  assert.equal(legacyIncompleteCheckout.response.status, 409);
  assert.equal(legacyIncompleteCheckout.body.error.code, 'listing_incomplete');

  const ordersUnauthorized = await getJson('/api/admin/orders');
  assert.equal(ordersUnauthorized.response.status, 403);
  const orders = await getJson('/api/admin/orders', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  assert.equal(orders.response.status, 200);
  assert.equal(orders.body.items.length, 2);
  assert.equal(orders.body.items.find((item) => item.status === 'paid').customerEmail, 'buyer@example.test');

  const reportPayload = { listingId, category: 'image_issue', message: 'The cover image looks incorrect.' };
  const report = await getJson('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reportPayload)
  });
  assert.equal(report.response.status, 201);
  assert.equal(report.body.report.status, 'received');

  const honeypot = await getJson('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reportPayload, website: 'spam.example' })
  });
  assert.equal(honeypot.response.status, 202);

  for (let index = 0; index < 4; index += 1) {
    const extraReport = await getJson('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...reportPayload, message: `Additional report ${index + 1}.` })
    });
    assert.equal(extraReport.response.status, 201);
  }
  const rateLimited = await getJson('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reportPayload, message: 'One more report.' })
  });
  assert.equal(rateLimited.response.status, 429);

  const reportsUnauthorized = await getJson('/api/admin/reports');
  assert.equal(reportsUnauthorized.response.status, 403);
  const reports = await getJson('/api/admin/reports', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  assert.equal(reports.response.status, 200);
  assert.equal(reports.body.items.length, 5);
  assert.equal(reports.body.items[0].listingId, listingId);

  const resolved = await getJson(`/api/admin/reports/${encodeURIComponent(report.body.report.id)}/resolve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  assert.equal(resolved.response.status, 200);
});

test('never enables Checkout with a live-mode Stripe key', async () => {
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-of-briar-live-key-test-'));
  const isolatedContext = createApp({
    dataDir: isolatedDir,
    seedProducts: [],
    stripe: { checkout: { sessions: { create: async () => { throw new Error('Must not be called.'); } } } },
    stripeSecretKey: 'sk_live_fixture_only',
    webhookSecret: 'whsec_test_fixture',
    storeConfig: {
      currency: 'usd',
      publicUrl: 'https://shop.example.test',
      shippingAmountCents: 500,
      shippingCountries: ['US'],
      shippingMinimumDays: 3,
      shippingMaximumDays: 5,
      returnsPolicy: 'Returns accepted within 14 days of delivery.',
      supportEmail: 'support@example.test'
    }
  });
  const isolatedServer = isolatedContext.app.listen(0, '127.0.0.1');
  try {
    await once(isolatedServer, 'listening');
    const origin = `http://127.0.0.1:${isolatedServer.address().port}`;
    const configResponse = await fetch(`${origin}/api/store-config`);
    const config = await configResponse.json();
    assert.equal(config.checkoutEnabled, false);
    const checkoutResponse = await fetch(`${origin}/api/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'test-live-rejected-001', items: [{ id: 'anything', quantity: 1 }] })
    });
    assert.equal(checkoutResponse.status, 503);
  } finally {
    if (isolatedServer.listening) await new Promise((resolve, reject) => isolatedServer.close((error) => error ? reject(error) : resolve()));
    isolatedContext.db.close();
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
});
