const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const Stripe = require('stripe');

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;
const ALLOWED_CATEGORIES = new Set(['home', 'wellness', 'gift', 'apparel', 'accessories', 'other']);
const ALLOWED_AVAILABILITY = new Set(['unknown', 'in_stock', 'made_to_order', 'out_of_stock']);
const ALLOWED_REPORT_CATEGORIES = new Set(['incorrect_details', 'image_issue', 'availability', 'other']);

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    return crypto.timingSafeEqual(
      crypto.createHash('sha256').update(a).digest(),
      crypto.createHash('sha256').update(b).digest()
    );
  } catch {
    return false;
  }
}

function parseDesignerTokens(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function makeId() {
  return crypto.randomUUID();
}

function isTestStripeKey(value) {
  return typeof value === 'string' && /^(sk|rk)_test_/.test(value);
}

function detectImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function validateListingInput(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const price = Number(body.price);
  const category = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  const availabilityResult = validateAvailabilityInput(body);

  if (!title || title.length > 120) return { error: 'Provide a valid title between 1 and 120 characters.' };
  if (description.length > 2000) return { error: 'Description must be 2,000 characters or fewer.' };
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Enter a valid price between 0 and 1,000,000.' };
  if (Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) return { error: 'Prices must be entered in increments of 0.01.' };
  if (!ALLOWED_CATEGORIES.has(category)) return { error: 'Choose a supported product category.' };
  if (availabilityResult.error) return availabilityResult;

  return { value: { title, description, price, category, ...availabilityResult.value } };
}

function validateAvailabilityInput(body = {}) {
  const availability = typeof body.availability === 'string' ? body.availability.trim().toLowerCase() : 'unknown';
  const availabilityNote = typeof body.availabilityNote === 'string' ? body.availabilityNote.trim() : '';
  const rawQuantity = body.stockQuantity;
  const stockQuantity = rawQuantity === undefined || rawQuantity === null || rawQuantity === '' ? null : Number(rawQuantity);
  if (!ALLOWED_AVAILABILITY.has(availability)) return { error: 'Choose a supported availability status.' };
  if (availabilityNote.length > 300) return { error: 'Availability details must be 300 characters or fewer.' };
  if (availability === 'in_stock' && (!Number.isInteger(stockQuantity) || stockQuantity < 1)) {
    return { error: 'Set an available quantity of at least 1 for an in-stock item.' };
  }
  if (availability === 'made_to_order' && !availabilityNote) {
    return { error: 'Add an estimated production or shipping time for made-to-order items.' };
  }
  return { value: { availability, stockQuantity: availability === 'in_stock' ? stockQuantity : null, availabilityNote } };
}

function validatePublicationReadiness(listing, imageCount) {
  if (imageCount < 1) return 'Add at least one product photo before publication.';
  if (!Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) return 'Set a price greater than zero before publication.';
  if (Math.abs(Number(listing.price) * 100 - Math.round(Number(listing.price) * 100)) > 0.000001) return 'Prices must be in increments of 0.01.';
  if (String(listing.description || '').trim().length < 20) return 'Add a complete product description (at least 20 characters).';
  if (listing.availability === 'unknown') return 'Set product availability before publication.';
  if (listing.availability === 'in_stock' && (!Number.isInteger(listing.stock_quantity) || listing.stock_quantity < 1)) {
    return 'Set the available quantity before publishing an in-stock product.';
  }
  if (listing.availability === 'made_to_order' && !String(listing.availability_note || '').trim()) {
    return 'Add a production or delivery estimate before publishing a made-to-order product.';
  }
  return '';
}

function createApp(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(rootDir, '.data'));
  const imagesDir = path.join(dataDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const db = options.db || new Database(options.databasePath || path.join(dataDir, 'catalog.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      designer_id TEXT NOT NULL,
      idempotency_key TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      category TEXT NOT NULL,
      availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown','in_stock','made_to_order','out_of_stock')),
      stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
      availability_note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('draft','pending_review','published','rejected','archived','deleted')),
      moderation_status TEXT NOT NULL CHECK (moderation_status IN ('pending','approved','rejected')),
      legacy_image_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE UNIQUE INDEX IF NOT EXISTS listings_unique_idempotency
      ON listings(designer_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS listing_images (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      client_image_key TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      position INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      upload_status TEXT NOT NULL CHECK (upload_status IN ('ready','deleted')),
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(listing_id, client_image_key)
    );

    CREATE INDEX IF NOT EXISTS listing_images_listing ON listing_images(listing_id, upload_status, position);

    CREATE TABLE IF NOT EXISTS listing_reports (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES listings(id),
      category TEXT NOT NULL CHECK (category IN ('incorrect_details','image_issue','availability','other')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS listing_reports_status_created ON listing_reports(status, created_at);

    CREATE TABLE IF NOT EXISTS checkout_orders (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      stripe_session_id TEXT UNIQUE,
      stripe_session_url TEXT,
      status TEXT NOT NULL CHECK (status IN ('checkout_pending','paid','expired','failed')),
      currency TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      shipping_cents INTEGER NOT NULL,
      items_json TEXT NOT NULL,
      customer_email TEXT,
      shipping_details_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL
    );
  `);

  const listingColumns = new Set(db.pragma('table_info(listings)').map((column) => column.name));
  if (!listingColumns.has('availability')) {
    db.exec("ALTER TABLE listings ADD COLUMN availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown','in_stock','made_to_order','out_of_stock'))");
  }
  if (!listingColumns.has('stock_quantity')) {
    db.exec('ALTER TABLE listings ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0)');
  }
  if (!listingColumns.has('availability_note')) {
    db.exec("ALTER TABLE listings ADD COLUMN availability_note TEXT NOT NULL DEFAULT ''");
  }

  const designerTokens = parseDesignerTokens(options.designerTokens ?? process.env.DESIGNER_TOKENS_JSON);
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  const reviewRequired = options.reviewRequired ?? process.env.REVIEW_REQUIRED !== 'false';
  const reportAttempts = new Map();
  const checkoutAttempts = new Map();
  const stripeSecretKey = options.stripeSecretKey ?? process.env.STRIPE_SECRET_KEY ?? '';
  const stripeTestMode = options.stripeTestMode === true || isTestStripeKey(stripeSecretKey);
  const stripeClient = options.stripe || (isTestStripeKey(stripeSecretKey) ? new Stripe(stripeSecretKey) : null);
  const webhookSecret = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';
  const config = options.storeConfig || {};
  const currency = String(config.currency ?? process.env.STORE_CURRENCY ?? 'usd').trim().toLowerCase();
  const storeUrlValue = String(config.publicUrl ?? process.env.STORE_PUBLIC_URL ?? '').trim();
  let storePublicUrl = '';
  try {
    const parsed = new URL(storeUrlValue);
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
      storePublicUrl = parsed.origin;
    }
  } catch {}
  const rawCountries = config.shippingCountries ?? process.env.SHIPPING_ALLOWED_COUNTRIES ?? '';
  const shippingCountries = (Array.isArray(rawCountries) ? rawCountries : String(rawCountries).split(','))
    .map((country) => String(country).trim().toUpperCase())
    .filter((country) => /^[A-Z]{2}$/.test(country));
  const integerSetting = (value) => value === undefined || value === null || value === '' ? null : Number.isInteger(Number(value)) ? Number(value) : null;
  const shippingAmountCents = integerSetting(config.shippingAmountCents ?? process.env.SHIPPING_AMOUNT_CENTS);
  const shippingMinimumDays = integerSetting(config.shippingMinimumDays ?? process.env.SHIPPING_MIN_BUSINESS_DAYS);
  const shippingMaximumDays = integerSetting(config.shippingMaximumDays ?? process.env.SHIPPING_MAX_BUSINESS_DAYS);
  const shippingDisplayName = String(config.shippingDisplayName ?? process.env.SHIPPING_DISPLAY_NAME ?? '').trim() || 'Standard shipping';
  const returnsPolicy = String(config.returnsPolicy ?? process.env.RETURNS_POLICY_TEXT ?? '').trim();
  const supportEmail = String(config.supportEmail ?? process.env.SUPPORT_EMAIL ?? '').trim();
  const supportPhone = String(config.supportPhone ?? process.env.SUPPORT_PHONE ?? '').trim();
  const validSupportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
  const shippingConfigured = shippingAmountCents !== null && shippingAmountCents >= 0
    && shippingCountries.length > 0
    && Number.isInteger(shippingMinimumDays) && shippingMinimumDays > 0
    && Number.isInteger(shippingMaximumDays) && shippingMaximumDays >= shippingMinimumDays;
  const checkoutEnabled = Boolean(stripeClient && stripeTestMode && webhookSecret.startsWith('whsec_')
    && /^[a-z]{3}$/.test(currency) && storePublicUrl && shippingConfigured
    && returnsPolicy && (validSupportEmail || supportPhone));
  const publicStoreConfig = () => ({
    currency,
    checkoutEnabled,
    paymentEnvironment: 'test',
    shipping: shippingConfigured ? {
      amountCents: shippingAmountCents,
      displayName: shippingDisplayName,
      countries: shippingCountries,
      minimumBusinessDays: shippingMinimumDays,
      maximumBusinessDays: shippingMaximumDays
    } : null,
    returnsPolicy: returnsPolicy || null,
    support: { email: validSupportEmail ? supportEmail : null, phone: supportPhone || null }
  });

  const seedProducts = options.seedProducts || JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'seed-products.json'), 'utf8'));
  const insertSeed = db.prepare(`
    INSERT OR IGNORE INTO listings (
      id, designer_id, title, description, price, category, availability, stock_quantity, availability_note, status, moderation_status,
      legacy_image_url, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'approved', ?, ?, ?, ?)
  `);
  const seedTx = db.transaction((rows) => {
      const now = new Date().toISOString();
      for (const row of rows) {
        insertSeed.run(
          row.id,
          row.designerId || 'house-of-briar',
          row.title,
          row.description || '',
          Number(row.price) || 0,
          row.category || 'home',
          row.availability || 'unknown',
          row.stockQuantity ?? null,
          row.availabilityNote || '',
          row.legacyImageUrl || null,
          now,
          now,
          now
      );
    }
  });
  seedTx(seedProducts);

  function fail(res, status, code, message) {
    return res.status(status).json({ error: { code, message } });
  }

  function allowReport(ipAddress) {
    const now = Date.now();
    const key = ipAddress || 'unknown';
    const recent = (reportAttempts.get(key) || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
    if (recent.length >= 5) {
      reportAttempts.set(key, recent);
      return false;
    }
    recent.push(now);
    reportAttempts.set(key, recent);
    if (reportAttempts.size > 1000) {
      for (const [storedKey, timestamps] of reportAttempts) {
        if (!timestamps.some((timestamp) => now - timestamp < 15 * 60 * 1000)) reportAttempts.delete(storedKey);
      }
    }
    return true;
  }

  function allowCheckout(ipAddress) {
    const now = Date.now();
    const key = ipAddress || 'unknown';
    const recent = (checkoutAttempts.get(key) || []).filter((timestamp) => now - timestamp < 15 * 60 * 1000);
    if (recent.length >= 10) {
      checkoutAttempts.set(key, recent);
      return false;
    }
    recent.push(now);
    checkoutAttempts.set(key, recent);
    if (checkoutAttempts.size > 1000) {
      for (const [candidate, timestamps] of checkoutAttempts) {
        const active = timestamps.filter((timestamp) => now - timestamp < 15 * 60 * 1000);
        if (active.length) checkoutAttempts.set(candidate, active);
        else checkoutAttempts.delete(candidate);
      }
    }
    return true;
  }

  function releaseOrderReservation(orderId, nextStatus) {
    const timestamp = new Date().toISOString();
    return db.transaction(() => {
      const order = db.prepare("SELECT * FROM checkout_orders WHERE id = ? AND status = 'checkout_pending'").get(orderId);
      if (!order) return false;
      const items = JSON.parse(order.items_json);
      for (const item of items) {
        if (item.reservedQuantity > 0) {
          db.prepare(`
            UPDATE listings
            SET stock_quantity = COALESCE(stock_quantity, 0) + ?, updated_at = ?, version = version + 1
            WHERE id = ?
          `).run(item.reservedQuantity, timestamp, item.id);
        }
      }
      db.prepare("UPDATE checkout_orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'checkout_pending'")
        .run(nextStatus, timestamp, orderId);
      return true;
    })();
  }

  function processStripeEvent(event) {
    const timestamp = new Date().toISOString();
    return db.transaction(() => {
      const inserted = db.prepare('INSERT OR IGNORE INTO stripe_webhook_events (event_id, received_at) VALUES (?, ?)')
        .run(event.id, timestamp).changes;
      if (!inserted) return;

      const session = event.data?.object || {};
      const order = (session.metadata?.orderId
        ? db.prepare('SELECT * FROM checkout_orders WHERE id = ?').get(session.metadata.orderId)
        : null) || (session.id ? db.prepare('SELECT * FROM checkout_orders WHERE stripe_session_id = ?').get(session.id) : null);
      if (!order || order.status !== 'checkout_pending') return;

      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
        && session.payment_status === 'paid') {
        const shipping = session.shipping_details || session.collected_information?.shipping_details || null;
        const email = session.customer_details?.email || session.customer_email || null;
        db.prepare(`
          UPDATE checkout_orders
          SET status = 'paid', customer_email = ?, shipping_details_json = ?, updated_at = ?
          WHERE id = ? AND status = 'checkout_pending'
        `).run(email, shipping ? JSON.stringify(shipping) : null, timestamp, order.id);
      } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        for (const item of JSON.parse(order.items_json)) {
          if (item.reservedQuantity > 0) {
            db.prepare(`
              UPDATE listings
              SET stock_quantity = COALESCE(stock_quantity, 0) + ?, updated_at = ?, version = version + 1
              WHERE id = ?
            `).run(item.reservedQuantity, timestamp, item.id);
          }
        }
        db.prepare("UPDATE checkout_orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'checkout_pending'")
          .run(event.type === 'checkout.session.expired' ? 'expired' : 'failed', timestamp, order.id);
      }
    })();
  }

  function authDesigner(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(res, 401, 'unauthorized', 'Sign in with a designer access token.');
    for (const [configuredToken, designerId] of Object.entries(designerTokens)) {
      if (safeEqual(token, configuredToken) && typeof designerId === 'string' && designerId.trim()) {
        req.designerId = designerId.trim();
        return next();
      }
    }
    return fail(res, 401, 'unauthorized', 'This designer token is invalid.');
  }

  function authAdmin(req, res, next) {
    const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!adminToken || !safeEqual(token, adminToken)) {
      return fail(res, 403, 'forbidden', 'Administrator access is required.');
    }
    return next();
  }

  function getListing(id) {
    return db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  }

  function getImages(listingId, mode = 'public') {
    const rows = db.prepare(`
      SELECT *
      FROM listing_images
      WHERE listing_id = ? AND upload_status = 'ready'
      ORDER BY position ASC, created_at ASC
    `).all(listingId);

    return rows.map((image) => ({
      id: image.id,
      position: image.position,
      mimeType: image.mime_type,
      sizeBytes: image.size_bytes,
      width: image.width,
      height: image.height,
      url: mode === 'private' ? `/api/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(image.id)}/content` : `/media/${encodeURIComponent(image.id)}`,
      legacy: false,
    }));
  }

  function serializeListing(row, mode = 'public') {
    if (!row) return null;
    const images = getImages(row.id, mode);
    const primaryImage = images[0] || (row.legacy_image_url ? { url: row.legacy_image_url, legacy: true, id: `legacy-${row.id}` } : null);
    const listing = {
      id: row.id,
      title: row.title,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      availability: row.availability,
      stockQuantity: row.availability === 'in_stock' ? row.stock_quantity : null,
      availabilityNote: row.availability_note || '',
      imageUrl: primaryImage?.url || null,
      primaryImage,
      images
    };
    if (mode !== 'public') {
      Object.assign(listing, {
        designerId: row.designer_id,
        status: row.status,
        moderationStatus: row.moderation_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
      });
    }
    return listing;
  }

  function ownedEditableListing(req, res) {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') {
      fail(res, 404, 'not_found', 'Listing not found.');
      return null;
    }
    if (!['draft', 'rejected'].includes(row.status)) {
      fail(res, 409, 'not_editable', 'Only draft or rejected listings can be edited.');
      return null;
    }
    return row;
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }
  });

  let app;
  app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    if (!stripeClient || !stripeTestMode || !webhookSecret.startsWith('whsec_')) {
      return fail(res, 503, 'webhook_not_configured', 'Stripe test webhooks are not configured.');
    }
    if (!Buffer.isBuffer(req.body)) return fail(res, 400, 'invalid_payload', 'A JSON webhook payload is required.');
    let event;
    try {
      event = stripeClient.webhooks.constructEvent(req.body, req.get('stripe-signature'), webhookSecret);
    } catch {
      return fail(res, 400, 'invalid_signature', 'The Stripe webhook signature could not be verified.');
    }
    try {
      processStripeEvent(event);
      return res.json({ received: true });
    } catch {
      return fail(res, 500, 'webhook_processing_failed', 'The Stripe event could not be processed.');
    }
  });
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/store-config', (_req, res) => res.json(publicStoreConfig()));

  app.post('/api/checkout/session', async (req, res) => {
    if (!checkoutEnabled) return fail(res, 503, 'checkout_not_configured', 'Stripe test checkout is not configured yet.');
    const body = req.body || {};
    const idempotencyKey = req.get('idempotency-key') || body.idempotencyKey;
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return fail(res, 400, 'invalid_idempotency_key', 'Provide a valid checkout idempotency key.');
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
      return fail(res, 422, 'invalid_cart', 'A checkout bag must contain between 1 and 20 product lines.');
    }
    const cart = [];
    const seenIds = new Set();
    for (const entry of body.items) {
      const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (!id || id.length > 100 || seenIds.has(id) || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 99) {
        return fail(res, 422, 'invalid_cart', 'Choose valid products and quantities for your bag.');
      }
      seenIds.add(id);
      cart.push({ id, quantity: entry.quantity });
    }
    cart.sort((a, b) => a.id.localeCompare(b.id));
    if (!allowCheckout(req.ip)) return fail(res, 429, 'rate_limited', 'Please wait before starting another checkout.');

    const staleCutoff = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const staleOrders = db.prepare("SELECT id FROM checkout_orders WHERE status = 'checkout_pending' AND stripe_session_url IS NULL AND created_at <= ?").all(staleCutoff);
    staleOrders.forEach((order) => releaseOrderReservation(order.id, 'expired'));

    const existing = db.prepare('SELECT * FROM checkout_orders WHERE idempotency_key = ?').get(idempotencyKey);
    let order = existing;
    let orderItems;
    if (existing) {
      const existingCart = JSON.parse(existing.items_json).map((item) => ({ id: item.id, quantity: item.quantity })).sort((a, b) => a.id.localeCompare(b.id));
      if (JSON.stringify(existingCart) !== JSON.stringify(cart)) return fail(res, 409, 'idempotency_conflict', 'Use a new checkout attempt after changing your bag.');
      if (existing.status !== 'checkout_pending') return fail(res, 409, 'checkout_closed', 'This checkout attempt is closed. Start a new checkout.');
      if (existing.stripe_session_url) return res.json({ url: existing.stripe_session_url, sessionId: existing.stripe_session_id });
      if (Date.now() - Date.parse(existing.created_at) >= 31 * 60 * 1000) {
        releaseOrderReservation(existing.id, 'expired');
        return fail(res, 409, 'checkout_expired', 'This checkout attempt expired. Please start again.');
      }
      orderItems = JSON.parse(existing.items_json);
    } else {
      const orderId = makeId();
      const timestamp = new Date().toISOString();
      try {
        const createOrder = db.transaction(() => {
          let subtotalCents = 0;
          orderItems = cart.map(({ id, quantity }) => {
            const product = db.prepare(`
              SELECT id, title, description, price, availability, stock_quantity, availability_note, legacy_image_url
              FROM listings
              WHERE id = ? AND status = 'published' AND moderation_status = 'approved'
            `).get(id);
            if (!product) throw Object.assign(new Error('A product is no longer available.'), { httpStatus: 409, errorCode: 'product_unavailable' });
            const readyImageCount = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(id).count
              + (product.legacy_image_url ? 1 : 0);
            const readinessError = validatePublicationReadiness(product, readyImageCount);
            if (readinessError) throw Object.assign(new Error(readinessError), { httpStatus: 409, errorCode: 'listing_incomplete' });
            if (!['in_stock', 'made_to_order'].includes(product.availability)) {
              throw Object.assign(new Error('A product does not have confirmed availability.'), { httpStatus: 409, errorCode: 'availability_unconfirmed' });
            }
            const unitAmountCents = Math.round(Number(product.price) * 100);
            if (!Number.isSafeInteger(unitAmountCents) || unitAmountCents < 1) {
              throw Object.assign(new Error('A product needs a valid price before it can be purchased.'), { httpStatus: 409, errorCode: 'invalid_product_price' });
            }
            let reservedQuantity = 0;
            if (product.availability === 'in_stock') {
              const result = db.prepare(`
                UPDATE listings SET stock_quantity = stock_quantity - ?, updated_at = ?, version = version + 1
                WHERE id = ? AND status = 'published' AND moderation_status = 'approved'
                  AND availability = 'in_stock' AND stock_quantity >= ?
              `).run(quantity, timestamp, id, quantity);
              if (!result.changes) throw Object.assign(new Error('A product does not have enough stock for that quantity.'), { httpStatus: 409, errorCode: 'stock_unavailable' });
              reservedQuantity = quantity;
            }
            subtotalCents += unitAmountCents * quantity;
            return {
              id,
              title: product.title,
              description: product.description,
              quantity,
              unitAmountCents,
              availability: product.availability,
              reservedQuantity
            };
          });
          if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 1 || subtotalCents > 999999999) {
            throw Object.assign(new Error('The checkout total is outside the supported range.'), { httpStatus: 422, errorCode: 'invalid_total' });
          }
          db.prepare(`
            INSERT INTO checkout_orders (
              id, idempotency_key, status, currency, subtotal_cents, shipping_cents,
              items_json, created_at, updated_at
            ) VALUES (?, ?, 'checkout_pending', ?, ?, ?, ?, ?, ?)
          `).run(orderId, idempotencyKey, currency, subtotalCents, shippingAmountCents, JSON.stringify(orderItems), timestamp, timestamp);
        });
        createOrder();
        order = db.prepare('SELECT * FROM checkout_orders WHERE id = ?').get(orderId);
      } catch (error) {
        if (error.httpStatus) return fail(res, error.httpStatus, error.errorCode, error.message);
        const racedOrder = db.prepare('SELECT * FROM checkout_orders WHERE idempotency_key = ?').get(idempotencyKey);
        if (racedOrder?.status === 'checkout_pending' && racedOrder.stripe_session_url) {
          return res.json({ url: racedOrder.stripe_session_url, sessionId: racedOrder.stripe_session_id });
        }
        return fail(res, 409, 'checkout_conflict', 'This checkout attempt could not be started safely. Please retry.');
      }
    }

    const stripeExpiresAt = Math.floor(Date.parse(order.created_at) / 1000) + 31 * 60;
    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: orderItems.map((item) => ({
        price_data: {
          currency,
          unit_amount: item.unitAmountCents,
          product_data: { name: item.title, description: String(item.description || '').slice(0, 500) }
        },
        quantity: item.quantity
      })),
      shipping_address_collection: { allowed_countries: shippingCountries },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingAmountCents, currency },
          display_name: shippingDisplayName,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: shippingMinimumDays },
            maximum: { unit: 'business_day', value: shippingMaximumDays }
          }
        }
      }],
      expires_at: stripeExpiresAt,
      success_url: `${storePublicUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${storePublicUrl}/?checkout=cancelled`,
      client_reference_id: order.id,
      metadata: { orderId: order.id }
    };

    try {
      const session = await stripeClient.checkout.sessions.create(sessionParams, { idempotencyKey });
      let checkoutUrl;
      try {
        const parsed = new URL(session.url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.stripe.com') throw new Error('Unexpected Stripe host');
        checkoutUrl = parsed.toString();
      } catch {
        return fail(res, 502, 'checkout_unavailable', 'Stripe did not return a valid hosted checkout URL.');
      }
      db.prepare('UPDATE checkout_orders SET stripe_session_id = ?, stripe_session_url = ?, updated_at = ? WHERE id = ?')
        .run(session.id, checkoutUrl, new Date().toISOString(), order.id);
      return res.json({ url: checkoutUrl, sessionId: session.id });
    } catch {
      return fail(res, 502, 'checkout_unavailable', 'Stripe could not start checkout. Please retry this attempt.');
    }
  });

  app.get('/api/checkout/session-status/:sessionId', (req, res) => {
    if (!/^cs_test_[A-Za-z0-9_]+$/.test(req.params.sessionId)) return fail(res, 404, 'not_found', 'Checkout session not found.');
    const order = db.prepare('SELECT status, currency, subtotal_cents, shipping_cents FROM checkout_orders WHERE stripe_session_id = ?').get(req.params.sessionId);
    if (!order) return fail(res, 404, 'not_found', 'Checkout session not found.');
    return res.json({
      status: order.status,
      currency: order.currency,
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents
    });
  });

  app.post('/api/session', authDesigner, (req, res) => {
    res.json({ designerId: req.designerId });
  });

  app.get('/api/gallery', (_req, res) => {
    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE status = 'published' AND moderation_status = 'approved'
      ORDER BY published_at DESC, created_at DESC
    `).all();
    res.json({ items: rows.map((row) => serializeListing(row, 'public')) });
  });

  app.post('/api/reports', (req, res) => {
    const body = req.body || {};
    if (typeof body.website === 'string' && body.website.trim()) return res.status(202).json({ ok: true });
    if (!allowReport(req.ip)) return fail(res, 429, 'rate_limited', 'Please wait before submitting another report.');

    const listingId = typeof body.listingId === 'string' ? body.listingId.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!listingId || listingId.length > 100) return fail(res, 422, 'validation_error', 'Choose a valid product to report.');
    if (!ALLOWED_REPORT_CATEGORIES.has(category)) return fail(res, 422, 'validation_error', 'Choose a report category.');
    if (message.length < 5 || message.length > 1000) return fail(res, 422, 'validation_error', 'Describe the issue in 5–1,000 characters.');

    const listing = db.prepare(`
      SELECT id FROM listings
      WHERE id = ? AND status = 'published' AND moderation_status = 'approved'
    `).get(listingId);
    if (!listing) return fail(res, 404, 'not_found', 'Published product not found.');

    const id = makeId();
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO listing_reports (id, listing_id, category, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, listingId, category, message, createdAt);
    return res.status(201).json({ report: { id, status: 'received' } });
  });

  app.get('/api/admin/reports', authAdmin, (_req, res) => {
    const rows = db.prepare(`
      SELECT r.id, r.listing_id AS listingId, l.title AS listingTitle, r.category,
        r.message, r.status, r.created_at AS createdAt
      FROM listing_reports r
      JOIN listings l ON l.id = r.listing_id
      ORDER BY r.created_at DESC
      LIMIT 200
    `).all();
    return res.json({ items: rows });
  });

  app.post('/api/admin/reports/:reportId/resolve', authAdmin, (req, res) => {
    const result = db.prepare("UPDATE listing_reports SET status = 'resolved' WHERE id = ? AND status = 'open'").run(req.params.reportId);
    if (!result.changes) return fail(res, 404, 'not_found', 'Open report not found.');
    return res.json({ ok: true });
  });

  app.get('/api/admin/orders', authAdmin, (_req, res) => {
    const rows = db.prepare(`
      SELECT id, status, currency, subtotal_cents AS subtotalCents,
        shipping_cents AS shippingCents, items_json, customer_email AS customerEmail,
        shipping_details_json, created_at AS createdAt, updated_at AS updatedAt
      FROM checkout_orders
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    return res.json({ items: rows.map((row) => ({
      ...row,
      items: JSON.parse(row.items_json),
      shippingDetails: row.shipping_details_json ? JSON.parse(row.shipping_details_json) : null,
      items_json: undefined,
      shipping_details_json: undefined
    })) });
  });

  app.get('/api/my/listings', authDesigner, (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM listings
      WHERE designer_id = ? AND status != 'deleted'
      ORDER BY updated_at DESC
    `).all(req.designerId);
    res.json({ items: rows.map((row) => serializeListing(row, 'private')) });
  });

  app.post('/api/listings', authDesigner, (req, res) => {
    const validation = validateListingInput(req.body || {});
    if (validation.error) return fail(res, 422, 'validation_error', validation.error);

    const submittedKey = req.get('idempotency-key') || req.body.idempotencyKey;
    const idempotencyKey = typeof submittedKey === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(submittedKey) ? submittedKey : null;
    if (submittedKey && !idempotencyKey) {
      return fail(res, 400, 'invalid_idempotency_key', 'Use a valid idempotency key between 8 and 128 characters.');
    }

    if (idempotencyKey) {
      const existing = db.prepare('SELECT * FROM listings WHERE designer_id = ? AND idempotency_key = ?').get(req.designerId, idempotencyKey);
      if (existing) return res.status(200).json({ item: serializeListing(existing, 'private'), reused: true });
    }

    const id = makeId();
    const timestamp = new Date().toISOString();
    db.prepare(`
      INSERT INTO listings (
        id, designer_id, idempotency_key, title, description, price, category, availability, stock_quantity, availability_note, status, moderation_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?)
    `).run(
      id,
      req.designerId,
      idempotencyKey,
      validation.value.title,
      validation.value.description,
      validation.value.price,
      validation.value.category,
      validation.value.availability,
      validation.value.stockQuantity,
      validation.value.availabilityNote,
      timestamp,
      timestamp
    );

    return res.status(201).json({ item: serializeListing(getListing(id), 'private'), reused: false });
  });

  app.get('/api/listings/:listingId', authDesigner, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    return res.json({ item: serializeListing(row, 'private') });
  });

  app.put('/api/listings/:listingId', authDesigner, (req, res) => {
    const row = ownedEditableListing(req, res);
    if (!row) return;
    const validation = validateListingInput(req.body || {});
    if (validation.error) return fail(res, 422, 'validation_error', validation.error);

    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET title = ?, description = ?, price = ?, category = ?, availability = ?, stock_quantity = ?, availability_note = ?, status = 'draft', moderation_status = 'pending', updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(
      validation.value.title,
      validation.value.description,
      validation.value.price,
      validation.value.category,
      validation.value.availability,
      validation.value.stockQuantity,
      validation.value.availabilityNote,
      timestamp,
      row.id
    );

    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.put('/api/listings/:listingId/availability', authDesigner, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') {
      return fail(res, 404, 'not_found', 'Listing not found.');
    }
    const validation = validateAvailabilityInput(req.body || {});
    if (validation.error) return fail(res, 422, 'validation_error', validation.error);
    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET availability = ?, stock_quantity = ?, availability_note = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(
      validation.value.availability,
      validation.value.stockQuantity,
      validation.value.availabilityNote,
      timestamp,
      row.id
    );
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.post('/api/listings/:listingId/images', authDesigner, upload.single('image'), async (req, res, next) => {
    try {
      const row = ownedEditableListing(req, res);
      if (!row) return;
      if (!req.file) return fail(res, 400, 'missing_image', 'Choose one image to upload.');

      const clientImageKey = req.get('idempotency-key') || req.body.clientImageKey;
      if (typeof clientImageKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(clientImageKey)) {
        return fail(res, 400, 'invalid_image_key', 'A unique image idempotency key is required.');
      }

      const existing = db.prepare('SELECT * FROM listing_images WHERE listing_id = ? AND client_image_key = ?').get(row.id, clientImageKey);
      if (existing) return res.status(200).json({ item: serializeListing(getListing(row.id), 'private'), reused: true });

      const detectedMime = detectImageMime(req.file.buffer);
      if (!detectedMime) return fail(res, 415, 'unsupported_image', 'Upload a valid JPEG, PNG, or WebP image.');

      let metadata;
      try {
        metadata = await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      } catch {
        return fail(res, 415, 'invalid_image', 'The selected file is not a readable image.');
      }

      if (!metadata.width || !metadata.height || metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
        return fail(res, 422, 'invalid_dimensions', 'Image dimensions must be 12,000 pixels or less on either side.');
      }
      if (metadata.pages && metadata.pages > 1) return fail(res, 415, 'animated_image', 'Animated images are not supported.');

      const count = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).count;
      if (count >= MAX_IMAGES) return fail(res, 422, 'image_limit', `A design can have at most ${MAX_IMAGES} images.`);

      const imageId = makeId();
      const storageKey = `${imageId}.webp`;
      const targetPath = path.join(imagesDir, storageKey);
      await sharp(req.file.buffer, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
        .rotate()
        .webp({ quality: 88, effort: 4 })
        .toFile(targetPath);

      const timestamp = new Date().toISOString();
      const imagePosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).next_pos;
      db.prepare(`
        INSERT INTO listing_images (
          id, listing_id, client_image_key, storage_key, position, mime_type,
          size_bytes, width, height, checksum, upload_status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, 'ready', ?)
      `).run(
        imageId,
        row.id,
        clientImageKey,
        storageKey,
        imagePosition,
        req.file.size,
        metadata.width,
        metadata.height,
        crypto.createHash('sha256').update(req.file.buffer).digest('hex'),
        timestamp
      );

      db.prepare('UPDATE listings SET updated_at = ?, version = version + 1 WHERE id = ?').run(timestamp, row.id);
      return res.status(201).json({ item: serializeListing(getListing(row.id), 'private'), reused: false });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/listings/:listingId/images/:imageId/content', authDesigner, (req, res) => {
    const row = db.prepare(`
      SELECT i.storage_key, i.mime_type
      FROM listing_images i
      JOIN listings l ON l.id = i.listing_id
      WHERE i.id = ? AND l.id = ? AND l.designer_id = ? AND i.upload_status = 'ready'
    `).get(req.params.imageId, req.params.listingId, req.designerId);
    if (!row) return fail(res, 404, 'not_found', 'Image not found.');
    res.type(row.mime_type);
    res.set('Cache-Control', 'private, no-store');
    return res.sendFile(path.join(imagesDir, row.storage_key));
  });

  app.put('/api/listings/:listingId/images/order', authDesigner, (req, res) => {
    const row = ownedEditableListing(req, res);
    if (!row) return;

    const imageIds = Array.isArray(req.body?.imageIds) ? req.body.imageIds : [];
    if (!imageIds.length || imageIds.length > MAX_IMAGES || imageIds.some((id) => typeof id !== 'string')) {
      return fail(res, 422, 'invalid_order', 'Provide an ordered list of image IDs.');
    }

    const currentIds = db.prepare("SELECT id FROM listing_images WHERE listing_id = ? AND upload_status = 'ready' ORDER BY position ASC").all(row.id).map((item) => item.id);
    if (new Set(imageIds).size !== imageIds.length || imageIds.length !== currentIds.length || imageIds.some((id) => !currentIds.includes(id))) {
      return fail(res, 422, 'invalid_order', 'The order must include every image exactly once.');
    }

    const timestamp = new Date().toISOString();
    const stmt = db.prepare('UPDATE listing_images SET position = ? WHERE id = ? AND listing_id = ?');
    db.transaction(() => {
      imageIds.forEach((id, index) => stmt.run(index, id, row.id));
      db.prepare('UPDATE listings SET updated_at = ?, version = version + 1 WHERE id = ?').run(timestamp, row.id);
    })();

    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.delete('/api/listings/:listingId/images/:imageId', authDesigner, (req, res) => {
    const row = ownedEditableListing(req, res);
    if (!row) return;
    const target = db.prepare("SELECT * FROM listing_images WHERE id = ? AND listing_id = ? AND upload_status = 'ready'").get(req.params.imageId, row.id);
    if (!target) return fail(res, 404, 'not_found', 'Image not found.');

    const remaining = db.prepare("SELECT id FROM listing_images WHERE listing_id = ? AND upload_status = 'ready' AND id != ? ORDER BY position ASC").all(row.id, target.id);
    const timestamp = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE listing_images SET upload_status = 'deleted', deleted_at = ? WHERE id = ?").run(timestamp, target.id);
      remaining.forEach((image, index) => {
        db.prepare('UPDATE listing_images SET position = ? WHERE id = ?').run(index, image.id);
      });
      db.prepare('UPDATE listings SET updated_at = ?, version = version + 1 WHERE id = ?').run(timestamp, row.id);
    })();

    const storagePath = path.join(imagesDir, target.storage_key);
    fs.promises.unlink(storagePath).catch(() => {});
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.post('/api/listings/:listingId/submit', authDesigner, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.designer_id !== req.designerId || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (!['draft', 'rejected'].includes(row.status)) return res.json({ item: serializeListing(row, 'private'), reused: true });

    const imageCount = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).count;
    if (imageCount < 1) return fail(res, 422, 'images_required', 'Add at least one ready image before submitting.');
    const readinessError = validatePublicationReadiness(row, imageCount);
    if (readinessError) return fail(res, 422, 'listing_incomplete', readinessError);

    const nextStatus = reviewRequired ? 'pending_review' : 'published';
    const nextModeration = reviewRequired ? 'pending' : 'approved';
    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = ?, moderation_status = ?, published_at = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(nextStatus, nextModeration, reviewRequired ? null : timestamp, timestamp, row.id);

    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.post('/api/admin/listings/:listingId/approve', authAdmin, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (row.status !== 'pending_review') return fail(res, 409, 'invalid_state', 'Only pending listings can be approved.');

    const imageCount = db.prepare("SELECT COUNT(*) AS count FROM listing_images WHERE listing_id = ? AND upload_status = 'ready'").get(row.id).count;
    if (imageCount < 1) return fail(res, 422, 'images_required', 'This listing has no ready images.');
    const readinessError = validatePublicationReadiness(row, imageCount);
    if (readinessError) return fail(res, 422, 'listing_incomplete', readinessError);

    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = 'published', moderation_status = 'approved', published_at = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(timestamp, timestamp, row.id);

    return res.json({ item: serializeListing(getListing(row.id), 'admin') });
  });

  app.post('/api/admin/listings/:listingId/reject', authAdmin, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (row.status !== 'pending_review') return fail(res, 409, 'invalid_state', 'Only pending listings can be rejected.');

    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = 'rejected', moderation_status = 'rejected', published_at = NULL, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(timestamp, row.id);
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.post('/api/admin/listings/:listingId/unpublish', authAdmin, (req, res) => {
    const row = getListing(req.params.listingId);
    if (!row || row.status === 'deleted') return fail(res, 404, 'not_found', 'Listing not found.');
    if (row.status !== 'published') return fail(res, 409, 'invalid_state', 'Only published listings can be archived.');

    const timestamp = new Date().toISOString();
    db.prepare(`UPDATE listings SET status = 'archived', updated_at = ?, version = version + 1 WHERE id = ?`).run(timestamp, row.id);
    return res.json({ item: serializeListing(getListing(row.id), 'private') });
  });

  app.get('/media/:imageId', (req, res) => {
    const row = db.prepare(`
      SELECT i.storage_key, i.mime_type
      FROM listing_images i
      JOIN listings l ON l.id = i.listing_id
      WHERE i.id = ? AND i.upload_status = 'ready' AND l.status = 'published' AND l.moderation_status = 'approved'
    `).get(req.params.imageId);
    if (!row) return fail(res, 404, 'not_found', 'Image not found.');
    res.type(row.mime_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(path.join(imagesDir, row.storage_key));
  });

  app.get('/', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));
  app.get('/index.html', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));
  app.get('/styles.css', (_req, res) => res.sendFile(path.join(rootDir, 'styles.css')));
  app.get('/script.js', (_req, res) => res.sendFile(path.join(rootDir, 'script.js')));

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error';
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 10 MiB or smaller.' : 'The upload could not be processed.';
      return fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, code, message);
    }
    console.error('Request failed:', error);
    return fail(res, 500, 'internal_error', 'The request could not be completed.');
  });

  app.use((_req, res) => fail(res, 404, 'not_found', 'Route not found.'));

  return { app, db, dataDir, imagesDir, reviewRequired };
}

if (require.main === module) {
  const { app, db } = createApp();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`House of Briar listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp, detectImageMime, MAX_IMAGES, MAX_IMAGE_BYTES };
