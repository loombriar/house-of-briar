const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;
const ALLOWED_CATEGORIES = new Set(['home', 'wellness', 'gift', 'apparel', 'accessories', 'other']);

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

  if (!title || title.length > 120) return { error: 'Provide a valid title between 1 and 120 characters.' };
  if (description.length > 2000) return { error: 'Description must be 2,000 characters or fewer.' };
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Enter a valid price between 0 and 1,000,000.' };
  if (!ALLOWED_CATEGORIES.has(category)) return { error: 'Choose a supported product category.' };

  return { value: { title, description, price, category } };
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
  `);

  const designerTokens = parseDesignerTokens(options.designerTokens ?? process.env.DESIGNER_TOKENS_JSON);
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  const reviewRequired = options.reviewRequired ?? process.env.REVIEW_REQUIRED !== 'false';

  const seedProducts = options.seedProducts || JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'seed-products.json'), 'utf8'));
  const insertSeed = db.prepare(`
    INSERT OR IGNORE INTO listings (
      id, designer_id, title, description, price, category, status, moderation_status,
      legacy_image_url, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'published', 'approved', ?, ?, ?, ?)
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
      url: mode === 'public' ? `/media/${encodeURIComponent(image.id)}` : `/api/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(image.id)}/content`,
      legacy: false,
    }));
  }

  function serializeListing(row, mode = 'public') {
    if (!row) return null;
    const images = getImages(row.id, mode);
    const primaryImage = images[0] || (row.legacy_image_url ? { url: row.legacy_image_url, legacy: true, id: `legacy-${row.id}` } : null);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      designerId: row.designer_id,
      status: row.status,
      moderationStatus: row.moderation_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      imageUrl: primaryImage?.url || null,
      primaryImage,
      images
    };
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
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

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
        id, designer_id, idempotency_key, title, description, price, category, status, moderation_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'pending', ?, ?)
    `).run(
      id,
      req.designerId,
      idempotencyKey,
      validation.value.title,
      validation.value.description,
      validation.value.price,
      validation.value.category,
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
      SET title = ?, description = ?, price = ?, category = ?, status = 'draft', moderation_status = 'pending', updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(
      validation.value.title,
      validation.value.description,
      validation.value.price,
      validation.value.category,
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

    const timestamp = new Date().toISOString();
    db.prepare(`
      UPDATE listings
      SET status = 'published', moderation_status = 'approved', published_at = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(timestamp, timestamp, row.id);

    return res.json({ item: serializeListing(getListing(row.id), 'public') });
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
