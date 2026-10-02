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

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-of-briar-test-'));
  context = createApp({
    dataDir: tempDir,
    seedProducts: [],
    designerTokens: {
      [DESIGNER_TOKEN]: 'designer-a',
      [OTHER_DESIGNER_TOKEN]: 'designer-b'
    },
    adminToken: ADMIN_TOKEN,
    reviewRequired: true
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
      description: 'A test listing.',
      price: 42.5,
      category: 'home'
    })
  });
  assert.equal(created.response.status, 201);
  const listingId = created.body.item.id;
  assert.equal(created.body.item.status, 'draft');

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
  for (const field of ['designerId', 'status', 'moderationStatus', 'createdAt', 'updatedAt', 'publishedAt']) {
    assert.equal(Object.hasOwn(publishedGallery.body.items[0], field), false, `public gallery must not expose ${field}`);
  }
  assert.equal(Object.hasOwn(publishedGallery.body.items[0], 'price'), true);
  assert.equal(Object.hasOwn(publishedGallery.body.items[0], 'description'), true);

  const publicImage = await fetch(`${baseUrl}/media/${encodeURIComponent(reorderedIds[0])}`);
  assert.equal(publicImage.status, 200);
  assert.match(publicImage.headers.get('content-type'), /image\/webp/);
});
