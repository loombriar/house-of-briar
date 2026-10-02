const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const byId = (id) => document.getElementById(id);
const year = byId('year');
if (year) year.textContent = new Date().getFullYear();

const productGrid = byId('product-grid');
const shopStatus = byId('shop-status');
const designerModal = byId('designer-modal');
const designerLoginBtn = byId('designer-login-btn');
const designerLoginForm = byId('designer-login-form');
const designerTokenInput = byId('designer-token');
const designerAuthMessage = byId('designer-auth-message');
const loginPanel = byId('designer-login-panel');
const designerWorkspace = byId('designer-workspace');
const designerProductsContainer = byId('designer-products');
const productForm = byId('product-form');
const photoInput = byId('product-photos');
const photoPreview = byId('photo-preview');
const uploadMessage = byId('upload-message');
const modalClose = byId('modal-close');
const productDialog = byId('product-dialog');
const productDetailTitle = byId('product-detail-title');
const productDetailContent = byId('product-detail-content');
const productIdInput = byId('product-id');
const listingFormTitle = byId('listing-form-title');
const searchInput = byId('product-search');
const sortSelect = byId('product-sort');
const cartOpenButton = byId('cart-open-btn');
const cartCount = byId('cart-count');
const cartDialog = byId('cart-dialog');
const cartItemsContainer = byId('cart-items');
const cartSubtotal = byId('cart-subtotal');
const cartPolicySummary = byId('cart-policy-summary');
const checkoutButton = byId('checkout-button');
const checkoutStatus = byId('checkout-status');
const reportDialog = byId('report-dialog');
const reportForm = byId('report-form');
const reportStatus = byId('report-status');

let designerToken = sessionStorage.getItem('briarDesignerToken') || '';
let currentListingId = '';
let currentIdempotencyKey = '';
let galleryItems = [];
let selectedImages = [];
let activeFilter = 'all';
let searchTerm = '';
let sortOrder = 'featured';
let guestCart = readGuestCart();
let storeConfig = null;
let checkoutIdempotencyKey = '';
const designerListImageUrls = new Set();

function setMessage(element, message = '', kind = '') {
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function categoryLabel(category) {
  return {
    home: 'Home',
    wellness: 'Wellness',
    gift: 'Gift',
    apparel: 'Apparel',
    accessories: 'Accessories',
    other: 'Other'
  }[category] || 'Other';
}

function availabilityLabel(product) {
  if (product.availability === 'in_stock') {
    if (product.stockQuantity === 0) return 'Out of stock';
    return Number.isInteger(product.stockQuantity) ? `${product.stockQuantity} available` : 'In stock';
  }
  if (product.availability === 'made_to_order') return 'Made to order';
  if (product.availability === 'out_of_stock') return 'Out of stock';
  return 'Availability not configured';
}

function canAddToCart(product) {
  if (product.availability === 'made_to_order') return true;
  return product.availability === 'in_stock' && Number.isInteger(product.stockQuantity) && product.stockQuantity > 0;
}

function makeElement(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function formatMoney(amount) {
  const currency = storeConfig?.currency || 'usd';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(Number(amount || 0));
  } catch {
    return `$${Number(amount || 0).toFixed(2)}`;
  }
}

function formatCents(cents) {
  return formatMoney(Number(cents || 0) / 100);
}

function readGuestCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('houseOfBriar.guestCart.v1') || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((entry) => typeof entry?.id === 'string' && Number.isInteger(entry.quantity) && entry.quantity > 0 && entry.quantity <= 99);
  } catch {
    return [];
  }
}

function saveGuestCart() {
  try { localStorage.setItem('houseOfBriar.guestCart.v1', JSON.stringify(guestCart)); } catch {}
}

function authorizationHeaders(extra = {}) {
  const headers = new Headers(extra);
  if (designerToken) headers.set('Authorization', `Bearer ${designerToken}`);
  return headers;
}

async function loadPrivateImagePreview(url, trackForList = false) {
  const response = await fetch(url, { headers: authorizationHeaders() });
  if (!response.ok) throw new Error(`Image preview failed (${response.status}).`);
  const objectUrl = URL.createObjectURL(await response.blob());
  if (trackForList) designerListImageUrls.add(objectUrl);
  return objectUrl;
}

function clearDesignerListImagePreviews() {
  designerListImageUrls.forEach((url) => URL.revokeObjectURL(url));
  designerListImageUrls.clear();
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: authorizationHeaders(options.headers || {})
  });

  let payload = {};
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    const message = payload?.error?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  return payload;
}

function getProductImages(product) {
  if (Array.isArray(product.images) && product.images.length) {
    return [...product.images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  if (product.imageUrl) return [{ id: `legacy-${product.id}`, url: product.imageUrl, legacy: true, position: 0 }];
  return [];
}

function persistCart() {
  guestCart = guestCart.filter((entry) => typeof entry.id === 'string' && Number.isInteger(entry.quantity) && entry.quantity > 0 && entry.quantity <= 99);
  checkoutIdempotencyKey = '';
  saveGuestCart();
  renderCart();
}

function removeFromCart(productId) {
  guestCart = guestCart.filter((entry) => entry.id !== productId);
  persistCart();
}

function changeCartQuantity(productId, delta) {
  const entry = guestCart.find((item) => item.id === productId);
  if (!entry) return;
  const product = galleryItems.find((item) => item.id === productId);
  let next = entry.quantity + delta;
  if (next < 1) return removeFromCart(productId);
  if (next > 99) next = 99;
  if (product?.availability === 'in_stock' && Number.isInteger(product.stockQuantity)) {
    next = Math.min(next, product.stockQuantity);
  }
  entry.quantity = next;
  persistCart();
}

function addToCart(product) {
  if (!canAddToCart(product)) {
    setMessage(checkoutStatus, 'This item cannot be added until its availability is confirmed.', 'error');
    return;
  }
  const entry = guestCart.find((item) => item.id === product.id);
  const current = entry?.quantity || 0;
  if (product.availability === 'in_stock' && current >= product.stockQuantity) {
    setMessage(checkoutStatus, 'The available quantity for this item is already in your bag.', 'error');
    return;
  }
  if (entry) entry.quantity += 1;
  else guestCart.push({ id: product.id, quantity: 1 });
  persistCart();
  setMessage(checkoutStatus, `${product.title} added to your bag.`, 'success');
}

function renderCart() {
  if (!cartItemsContainer) return;
  const itemCount = guestCart.reduce((sum, entry) => sum + entry.quantity, 0);
  if (cartCount) cartCount.textContent = String(itemCount);
  if (cartOpenButton) cartOpenButton.setAttribute('aria-label', `Shopping bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`);
  cartItemsContainer.replaceChildren();

  let subtotalCents = 0;
  let hasUnavailableItem = false;
  if (!guestCart.length) {
    cartItemsContainer.appendChild(makeElement('p', 'cart-empty', 'Your bag is empty. Browse the collection to find something special.'));
  }

  for (const entry of guestCart) {
    const product = galleryItems.find((item) => item.id === entry.id);
    const row = makeElement('div', 'cart-item');
    const details = makeElement('div');
    details.appendChild(makeElement('h3', '', product?.title || 'Product no longer available'));
    if (!product || !canAddToCart(product) || (product.availability === 'in_stock' && entry.quantity > product.stockQuantity)) {
      hasUnavailableItem = true;
      const message = !product
        ? 'This product is no longer in the published collection. Remove it to continue.'
        : (product.availability === 'in_stock' && entry.quantity > product.stockQuantity)
          ? `Only ${product.stockQuantity} available. Reduce the quantity to continue.`
          : availabilityLabel(product);
      details.appendChild(makeElement('p', 'cart-item-meta', message));
    } else {
      subtotalCents += Math.round(Number(product.price || 0) * 100) * entry.quantity;
      details.appendChild(makeElement('p', 'cart-item-meta', `${availabilityLabel(product)} · ${formatMoney(product.price)} each`));
      if (product.availabilityNote) details.appendChild(makeElement('p', 'cart-item-meta', product.availabilityNote));
    }

    const actions = makeElement('div', 'cart-item-actions');
    const decrease = makeElement('button', '', '−');
    decrease.type = 'button';
    decrease.setAttribute('aria-label', `Decrease ${product?.title || 'product'} quantity`);
    decrease.addEventListener('click', () => changeCartQuantity(entry.id, -1));
    const quantity = makeElement('span', '', String(entry.quantity));
    const increase = makeElement('button', '', '+');
    increase.type = 'button';
    increase.setAttribute('aria-label', `Increase ${product?.title || 'product'} quantity`);
    increase.disabled = !product || !canAddToCart(product) || entry.quantity >= 99 || (product.availability === 'in_stock' && entry.quantity >= product.stockQuantity);
    increase.addEventListener('click', () => changeCartQuantity(entry.id, 1));
    const remove = makeElement('button', 'remove-cart-item', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => removeFromCart(entry.id));
    actions.append(decrease, quantity, increase, remove);
    row.append(details, actions);
    cartItemsContainer.appendChild(row);
  }

  if (cartSubtotal) cartSubtotal.textContent = formatCents(subtotalCents);
  const checkoutReady = Boolean(storeConfig?.checkoutEnabled && itemCount > 0 && !hasUnavailableItem);
  if (checkoutButton) {
    checkoutButton.disabled = !checkoutReady;
    checkoutButton.textContent = storeConfig?.checkoutEnabled ? 'Continue to secure Stripe checkout (test mode)' : 'Checkout not yet available';
  }
  if (checkoutStatus) {
    const message = hasUnavailableItem
      ? 'Remove unavailable items or adjust quantities before checkout.'
      : storeConfig?.checkoutEnabled
        ? 'Stripe test mode is enabled. Test payments are simulated and no live charge will be made.'
        : 'Checkout is disabled until the store policies and Stripe test webhook settings are configured.';
    setMessage(checkoutStatus, message, hasUnavailableItem ? 'error' : '');
  }
}

function renderStorePolicy() {
  if (!cartPolicySummary) return;
  cartPolicySummary.replaceChildren();
  if (storeConfig?.shipping) {
    const shipping = storeConfig.shipping;
    cartPolicySummary.appendChild(makeElement('p', '', `${shipping.displayName}: ${formatCents(shipping.amountCents)} per order. Estimated ${shipping.minimumBusinessDays}–${shipping.maximumBusinessDays} business days. Ships to ${shipping.countries.join(', ')}.`));
  } else {
    cartPolicySummary.appendChild(makeElement('p', '', 'Shipping price, delivery estimate, and destinations have not been configured yet.'));
  }
  if (storeConfig?.returnsPolicy) cartPolicySummary.appendChild(makeElement('p', '', `Returns: ${storeConfig.returnsPolicy}`));
  else cartPolicySummary.appendChild(makeElement('p', '', 'Returns and refund terms have not been configured yet.'));
  const support = storeConfig?.support || {};
  const contacts = [support.email, support.phone].filter(Boolean);
  cartPolicySummary.appendChild(makeElement('p', '', contacts.length ? `Questions? Contact ${contacts.join(' · ')}.` : 'Customer support contact details have not been configured yet.'));
  if (storeConfig?.checkoutEnabled) cartPolicySummary.appendChild(makeElement('p', 'small-print', 'Payment will be processed through Stripe test mode only.'));
}

async function loadStoreConfig() {
  try {
    storeConfig = await apiRequest('/api/store-config');
  } catch {
    storeConfig = null;
  }
  renderStorePolicy();
  renderCart();
}

async function startCheckout() {
  if (!checkoutButton || checkoutButton.disabled || !storeConfig?.checkoutEnabled) return;
  checkoutIdempotencyKey ||= crypto.randomUUID();
  checkoutButton.disabled = true;
  setMessage(checkoutStatus, 'Starting secure Stripe test checkout…', '');
  try {
    const payload = await apiRequest('/api/checkout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: checkoutIdempotencyKey, items: guestCart.map((entry) => ({ id: entry.id, quantity: entry.quantity })) })
    });
    const checkoutUrl = new URL(payload.url);
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') throw new Error('Stripe returned an unexpected checkout URL.');
    window.location.assign(checkoutUrl.toString());
  } catch (error) {
    if (['checkout_closed', 'checkout_expired', 'idempotency_conflict'].includes(error.code)) checkoutIdempotencyKey = '';
    setMessage(checkoutStatus, error.message, 'error');
    checkoutButton.disabled = false;
  }
}

async function handleCheckoutReturn() {
  const pageUrl = new URL(window.location.href);
  const returnState = pageUrl.searchParams.get('checkout');
  if (!returnState) return;
  if (returnState === 'cancelled') {
    setMessage(shopStatus, 'Checkout was canceled. Your guest shopping bag is still saved.', '');
  } else if (returnState === 'success') {
    const sessionId = pageUrl.searchParams.get('session_id') || '';
    setMessage(shopStatus, 'Checking the test payment with the store…', '');
    try {
      const status = await apiRequest(`/api/checkout/session-status/${encodeURIComponent(sessionId)}`, { headers: { 'Cache-Control': 'no-store' } });
      if (status.status === 'paid') {
        guestCart = [];
        checkoutIdempotencyKey = '';
        saveGuestCart();
        renderCart();
        setMessage(shopStatus, 'Your test payment was confirmed and the store received your order.', 'success');
      } else if (status.status === 'expired' || status.status === 'failed') {
        setMessage(shopStatus, 'The checkout did not complete. Your bag remains saved so you can try again.', 'error');
      } else {
        setMessage(shopStatus, 'Payment is awaiting Stripe confirmation. Your bag remains saved until the store confirms it.', '');
      }
    } catch (error) {
      setMessage(shopStatus, `Unable to verify the checkout yet: ${error.message}. Your bag remains saved.`, 'error');
    }
  }
  pageUrl.searchParams.delete('checkout');
  pageUrl.searchParams.delete('session_id');
  window.history.replaceState({}, '', `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
}

function renderGallery() {
  if (!productGrid) return;
  productGrid.replaceChildren();

  const query = searchTerm.trim().toLowerCase();
  const items = galleryItems
    .filter((item) => (activeFilter === 'all' || item.category === activeFilter)
      && (!query || `${item.title} ${item.description || ''} ${categoryLabel(item.category)}`.toLowerCase().includes(query)))
    .slice();
  if (sortOrder === 'price-asc') items.sort((a, b) => Number(a.price) - Number(b.price));
  if (sortOrder === 'price-desc') items.sort((a, b) => Number(b.price) - Number(a.price));
  if (sortOrder === 'name-asc') items.sort((a, b) => a.title.localeCompare(b.title));
  if (!items.length) {
    const empty = makeElement('p', 'empty-gallery', query ? 'No pieces match your search and filters.' : 'No published pieces are available in this category yet.');
    productGrid.appendChild(empty);
    return;
  }

  for (const item of items) {
    const images = getProductImages(item);
    const card = makeElement('button', 'product-card');
    card.type = 'button';
    card.setAttribute('aria-label', `View ${item.title} details`);
    card.addEventListener('click', () => openProductDetails(item));

    const imageWrap = makeElement('span', 'product-image');
    if (images[0]?.url) {
      const img = document.createElement('img');
      img.src = images[0].url;
      img.alt = `${item.title} cover photo`;
      img.loading = 'lazy';
      imageWrap.appendChild(img);
      if (images.length > 1) {
        const badge = makeElement('span', 'photo-count-badge', `${images.length} photos`);
        imageWrap.appendChild(badge);
      }
    } else {
      imageWrap.classList.add('product-image-fallback');
      imageWrap.textContent = 'House of Briar';
    }

    const body = makeElement('span', 'product-body');
    const meta = makeElement('span', 'meta-row');
    meta.appendChild(makeElement('span', 'badge', categoryLabel(item.category)));
    meta.appendChild(makeElement('span', 'price', formatMoney(item.price)));
    body.appendChild(meta);
    body.appendChild(makeElement('span', 'card-title', item.title));
    body.appendChild(makeElement('span', 'card-description', item.description || 'A one-of-a-kind designation from an independent designer.'));
    const availability = makeElement('span', 'availability-badge', availabilityLabel(item));
    availability.dataset.state = item.availability || 'unknown';
    body.appendChild(availability);
    card.append(imageWrap, body);
    productGrid.appendChild(card);
  }
}

async function loadGallery() {
  try {
    const payload = await apiRequest('/api/gallery');
    galleryItems = Array.isArray(payload.items) ? payload.items : [];
    renderGallery();
    renderCart();
    if (shopStatus) {
      setMessage(shopStatus, `${galleryItems.length} published ${galleryItems.length === 1 ? 'piece' : 'pieces'} in the gallery.`, 'success');
    }
  } catch (error) {
    if (shopStatus) setMessage(shopStatus, `Unable to load the gallery: ${error.message}`, 'error');
  }
}

function openProductDetails(item) {
  if (!productDialog) return;
  const images = getProductImages(item);
  productDetailTitle.textContent = item.title;
  productDetailContent.replaceChildren();

  const imageGrid = makeElement('div', 'product-detail-images');
  images.forEach((image, index) => {
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = `${item.title} image ${index + 1}`;
    img.loading = index === 0 ? 'eager' : 'lazy';
    imageGrid.appendChild(img);
  });

  const copy = makeElement('div', 'product-detail-copy');
  copy.appendChild(makeElement('span', 'badge', categoryLabel(item.category)));
  copy.appendChild(makeElement('h3', '', item.title));
  copy.appendChild(makeElement('strong', 'price', formatMoney(item.price)));
  copy.appendChild(makeElement('p', '', item.description || 'A carefully made piece from an independent designer.'));
  const availability = makeElement('span', 'availability-badge', availabilityLabel(item));
  availability.dataset.state = item.availability || 'unknown';
  copy.appendChild(availability);
  if (item.availabilityNote) copy.appendChild(makeElement('p', 'availability-note', item.availabilityNote));
  if (images.length > 1) copy.appendChild(makeElement('p', 'small-print', `${images.length} photos · first image is the cover`));

  const actions = makeElement('div', 'product-action-row');
  const addButton = makeElement('button', 'primary-button', canAddToCart(item) ? 'Add to bag' : 'Unavailable for purchase');
  addButton.type = 'button';
  addButton.disabled = !canAddToCart(item);
  addButton.addEventListener('click', () => addToCart(item));
  const reportButton = makeElement('button', 'secondary-button', 'Report an issue');
  reportButton.type = 'button';
  reportButton.addEventListener('click', () => openReportDialog(item));
  actions.append(addButton, reportButton);
  copy.appendChild(actions);

  productDetailContent.append(imageGrid, copy);
  productDialog.showModal();
}

function openReportDialog(product) {
  if (!reportDialog || !reportForm) return;
  byId('report-listing-id').value = product.id;
  byId('report-message').value = '';
  byId('report-website').value = '';
  setMessage(reportStatus, '', '');
  if (!reportDialog.open) reportDialog.showModal();
}

async function submitReport(event) {
  event.preventDefault();
  const payload = {
    listingId: byId('report-listing-id').value,
    category: byId('report-category').value,
    message: byId('report-message').value.trim(),
    website: byId('report-website').value.trim()
  };
  setMessage(reportStatus, 'Sending report…', '');
  try {
    await apiRequest('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    reportForm.reset();
    setMessage(reportStatus, 'Thank you. Your report was received for review.', 'success');
  } catch (error) {
    setMessage(reportStatus, error.message, 'error');
  }
}

function resetListingForm() {
  if (productForm) productForm.reset();
  currentListingId = '';
  currentIdempotencyKey = '';
  if (productIdInput) productIdInput.value = '';
  if (listingFormTitle) listingFormTitle.textContent = 'Add a design';
  selectedImages.forEach((item) => {
    if (item.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(item.objectUrl);
  });
  selectedImages = [];
  if (photoPreview) photoPreview.replaceChildren();
  setMessage(uploadMessage, '', '');
}

function validateSelectedImage(file) {
  const isAllowedMime = ALLOWED_MIME_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isAllowedMime) return 'Choose a JPEG, PNG, or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Each image must be 10 MiB or smaller.';
  return '';
}

function renderSelectedImages() {
  if (!photoPreview) return;
  photoPreview.replaceChildren();
  selectedImages.forEach((image, index) => {
    const item = makeElement('div', 'photo-preview-item');
    const img = document.createElement('img');
    img.src = image.objectUrl || image.url;
    img.alt = image.name || `Image ${index + 1}`;
    item.appendChild(img);
    item.appendChild(makeElement('span', 'photo-order-label', index === 0 ? 'Cover' : String(index + 1)));

    const info = makeElement('div', 'photo-preview-meta');
    info.appendChild(makeElement('strong', '', image.name || `Image ${index + 1}`));
    const statusText = image.status === 'uploading' ? 'Uploading…' : image.status === 'ready' ? 'Ready' : image.status === 'failed' ? (image.error || 'Failed') : 'Queued';
    info.appendChild(makeElement('span', '', `${statusText}${image.size ? ` · ${formatBytes(image.size)}` : ''}`));
    item.appendChild(info);

    const actions = makeElement('div', 'photo-preview-actions');
    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.textContent = 'Move up';
    moveUp.disabled = index === 0;
    moveUp.addEventListener('click', () => { if (index > 0) { [selectedImages[index], selectedImages[index - 1]] = [selectedImages[index - 1], selectedImages[index]]; renderSelectedImages(); } });
    actions.appendChild(moveUp);

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.textContent = 'Move down';
    moveDown.disabled = index === selectedImages.length - 1;
    moveDown.addEventListener('click', () => { if (index < selectedImages.length - 1) { [selectedImages[index], selectedImages[index + 1]] = [selectedImages[index + 1], selectedImages[index]]; renderSelectedImages(); } });
    actions.appendChild(moveDown);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (image.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(image.objectUrl);
      selectedImages.splice(index, 1);
      renderSelectedImages();
    });
    actions.appendChild(remove);

    item.appendChild(actions);
    photoPreview.appendChild(item);
  });
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const remainingSlots = MAX_IMAGES - selectedImages.length;
  const nextFiles = files.slice(0, Math.max(0, remainingSlots));
  const issues = [];

  nextFiles.forEach((file) => {
    const problem = validateSelectedImage(file);
    if (problem) {
      issues.push(`${file.name}: ${problem}`);
      return;
    }
    selectedImages.push({
      id: '',
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
      objectUrl: URL.createObjectURL(file),
      url: ''
    });
  });

  if (files.length > remainingSlots) {
    issues.push(`Only ${Math.max(0, remainingSlots)} more image slot(s) remain.`);
  }

  renderSelectedImages();
  setMessage(uploadMessage, issues.length ? issues.join(' ') : 'Photos selected. Save or submit to upload them.', issues.length ? 'error' : 'success');
  if (photoInput) photoInput.value = '';
}

function readFormValues() {
  return {
    title: byId('product-name').value.trim(),
    description: byId('product-description').value.trim(),
    price: byId('product-price').value,
    category: byId('product-category').value,
    availability: byId('product-availability').value,
    stockQuantity: byId('product-stock-quantity').value,
    availabilityNote: byId('product-availability-note').value.trim()
  };
}

function validateListingValues(values, requirePublishReady = false) {
  if (!values.title || values.title.length > 120) return 'Add a design name (1–120 characters).';
  if (values.description.length > 2000) return 'Description must be 2,000 characters or fewer.';
  if (!Number.isFinite(Number(values.price)) || Number(values.price) < 0 || Math.abs(Number(values.price) * 100 - Math.round(Number(values.price) * 100)) > 0.000001) return 'Provide a valid price in increments of 0.01.';
  if (values.availability === 'in_stock' && (!Number.isInteger(Number(values.stockQuantity)) || Number(values.stockQuantity) < 1)) return 'Set an available quantity of at least 1 for an in-stock item.';
  if (values.availability === 'made_to_order' && !values.availabilityNote) return 'Add an estimated production or shipping time for made-to-order items.';
  if (requirePublishReady) {
    if (Number(values.price) <= 0) return 'Set a price greater than zero before publication.';
    if (values.description.trim().length < 20) return 'Add a complete product description (at least 20 characters).';
    if (values.availability === 'unknown') return 'Set product availability before publication.';
    if (selectedImages.length < 1) return 'At least one photo is required before publication.';
  }
  return '';
}

async function ensureListing(values) {
  if (currentListingId) {
    return (await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    })).item;
  }

  const existingKey = currentIdempotencyKey || (currentIdempotencyKey = crypto.randomUUID());
  const payload = await apiRequest('/api/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': existingKey },
    body: JSON.stringify(values)
  });

  currentListingId = payload.item.id;
  if (productIdInput) productIdInput.value = payload.item.id;
  return payload.item;
}

async function uploadQueuedImages() {
  for (const image of selectedImages) {
    if (!image.file || image.status === 'ready' || image.status === 'uploading') continue;
    const knownImageIds = new Set(selectedImages.filter((selected) => selected.id).map((selected) => selected.id));
    image.status = 'uploading';
    renderSelectedImages();

    const formData = new FormData();
    formData.append('image', image.file, image.name);
    const key = image.clientImageKey || (image.clientImageKey = crypto.randomUUID());

    try {
      const payload = await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/images`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: formData
      });
      const uploaded = payload.item.images.find((entry) => entry.url && !entry.legacy && !knownImageIds.has(entry.id));
      if (uploaded) {
        image.id = uploaded.id;
        image.url = uploaded.url;
        image.status = 'ready';
        image.error = '';
      } else {
        image.status = 'failed';
        image.error = 'Upload returned no image reference.';
      }
    } catch (error) {
      image.status = 'failed';
      image.error = error.message;
    }

    renderSelectedImages();
  }
}

async function handleSave(event) {
  event.preventDefault();
  if (!designerToken) {
    setMessage(uploadMessage, 'Sign in to save a listing.', 'error');
    return;
  }

  const action = event.submitter?.value || 'draft';
  const values = readFormValues();
  const validationError = validateListingValues(values, action === 'submit');
  if (validationError) {
    setMessage(uploadMessage, validationError, 'error');
    return;
  }

  setMessage(uploadMessage, 'Saving the listing…', 'success');

  try {
    await ensureListing(values);
    await uploadQueuedImages();
    const failed = selectedImages.filter((image) => image.status === 'failed');
    if (failed.length && action === 'submit') {
      setMessage(uploadMessage, 'Fix or remove failed images before submitting.', 'error');
      return;
    }

    const order = selectedImages.filter((image) => image.status === 'ready' && image.id).map((image) => image.id);
    if (order.length) {
      await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/images/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: order })
      });
    }

    if (action === 'submit') {
      const payload = await apiRequest(`/api/listings/${encodeURIComponent(currentListingId)}/submit`, { method: 'POST' });
      if (payload.item.status === 'pending_review') {
        setMessage(uploadMessage, 'Submitted for review. It will appear in the Shop after approval.', 'success');
      } else {
        setMessage(uploadMessage, 'Published to the Shop gallery.', 'success');
      }
      await loadDesignerListings();
      await loadGallery();
      resetListingForm();
      return;
    }

    setMessage(uploadMessage, 'Draft saved successfully.', 'success');
    await loadDesignerListings();
  } catch (error) {
    setMessage(uploadMessage, error.message, 'error');
  }
}

function makeAvailabilityEditor(listing) {
  const editor = makeElement('div', 'availability-editor');
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Availability for ${listing.title}`);
  [
    ['unknown', 'Not configured'],
    ['in_stock', 'In stock'],
    ['made_to_order', 'Made to order'],
    ['out_of_stock', 'Out of stock']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = listing.availability || 'unknown';

  const stock = document.createElement('input');
  stock.type = 'number';
  stock.min = '1';
  stock.step = '1';
  stock.value = Number.isInteger(listing.stockQuantity) ? String(listing.stockQuantity) : '';
  stock.placeholder = 'Qty if in stock';
  stock.setAttribute('aria-label', `Available quantity for ${listing.title}`);

  const note = document.createElement('input');
  note.type = 'text';
  note.maxLength = 300;
  note.value = listing.availabilityNote || '';
  note.placeholder = 'Lead time / availability note';
  note.setAttribute('aria-label', `Availability details for ${listing.title}`);

  const save = makeElement('button', 'secondary-button', 'Update availability');
  save.type = 'button';
  const status = makeElement('p', 'form-message');
  save.addEventListener('click', async () => {
    save.disabled = true;
    setMessage(status, 'Saving availability…', '');
    try {
      await apiRequest(`/api/listings/${encodeURIComponent(listing.id)}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availability: select.value,
          stockQuantity: select.value === 'in_stock' ? stock.value : null,
          availabilityNote: note.value.trim()
        })
      });
      setMessage(status, 'Availability updated.', 'success');
      await Promise.all([loadGallery(), loadDesignerListings()]);
    } catch (error) {
      setMessage(status, error.message, 'error');
    } finally {
      save.disabled = false;
    }
  });
  editor.append(select, stock, note, save, status);
  return editor;
}

async function loadDesignerListings() {
  if (!designerToken) return;
  try {
    const payload = await apiRequest('/api/my/listings');
    clearDesignerListImagePreviews();
    if (designerProductsContainer) designerProductsContainer.replaceChildren();
    const listings = payload.items || [];
    if (!listings.length) {
      if (designerProductsContainer) designerProductsContainer.appendChild(makeElement('p', 'empty-state', 'No listings yet. Create a new design above.'));
      return;
    }

    for (const listing of listings) {
      const row = makeElement('div', 'designer-product-item');
      const images = getProductImages(listing);
      const preview = document.createElement('img');
      preview.alt = `${listing.title} preview`;
      preview.loading = 'lazy';
      if (images[0]?.url) {
        try {
          preview.src = await loadPrivateImagePreview(images[0].url, true);
        } catch {}
      }
      row.appendChild(preview);

      const info = makeElement('div', 'designer-product-info');
      info.appendChild(makeElement('h4', '', listing.title));
      info.appendChild(makeElement('p', '', `${images.length} photo${images.length === 1 ? '' : 's'} · ${categoryLabel(listing.category)} · ${availabilityLabel(listing)}`));
      row.appendChild(info);

      const actions = makeElement('div', 'designer-product-actions');
      const badge = makeElement('span', 'status-badge', listing.status === 'pending_review' ? 'Pending review' : listing.status === 'published' ? 'Published' : listing.status === 'rejected' ? 'Rejected' : listing.status === 'draft' ? 'Draft' : 'Archived');
      actions.appendChild(badge);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.className = 'text-button';
      edit.addEventListener('click', () => editListing(listing.id));
      if (['draft', 'rejected'].includes(listing.status)) actions.appendChild(edit);
      row.appendChild(actions);
      if (designerProductsContainer) designerProductsContainer.appendChild(row);
      if (designerProductsContainer) designerProductsContainer.appendChild(makeAvailabilityEditor(listing));
    }
  } catch (error) {
    if (error.status === 401) signOut();
    setMessage(designerAuthMessage, `Could not load listings: ${error.message}`, 'error');
  }
}

async function editListing(listingId) {
  try {
    const payload = await apiRequest(`/api/listings/${encodeURIComponent(listingId)}`);
    const listing = payload.item;
    currentListingId = listing.id;
    if (productIdInput) productIdInput.value = listing.id;
    if (byId('product-name')) byId('product-name').value = listing.title;
    if (byId('product-description')) byId('product-description').value = listing.description;
    if (byId('product-price')) byId('product-price').value = listing.price;
    if (byId('product-category')) byId('product-category').value = listing.category;
    if (byId('product-availability')) byId('product-availability').value = listing.availability || 'unknown';
    if (byId('product-stock-quantity')) byId('product-stock-quantity').value = Number.isInteger(listing.stockQuantity) ? listing.stockQuantity : '';
    if (byId('product-availability-note')) byId('product-availability-note').value = listing.availabilityNote || '';
    if (listingFormTitle) listingFormTitle.textContent = 'Edit a design';

    selectedImages.forEach((image) => {
      if (image.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(image.objectUrl);
    });
    selectedImages = [];
    renderSelectedImages();

    const images = getProductImages(listing);
    for (const image of images) {
      let objectUrl = image.url;
      if (!image.legacy) {
        try {
          objectUrl = await loadPrivateImagePreview(image.url);
        } catch {}
      }
      selectedImages.push({
        id: image.id,
        file: null,
        name: image.legacy ? 'Existing image' : 'Existing image',
        size: 0,
        status: 'ready',
        url: image.url,
        objectUrl
      });
    }
    renderSelectedImages();
    setMessage(uploadMessage, 'Draft loaded. You can add new images or remove existing ones.', 'success');
  } catch (error) {
    setMessage(uploadMessage, error.message, 'error');
  }
}

async function signIn(tokenValue) {
  const token = tokenValue.trim();
  if (!token) {
    setMessage(designerAuthMessage, 'Enter your designer access token.', 'error');
    return;
  }

  designerToken = token;
  try {
    await apiRequest('/api/session', { method: 'POST' });
    sessionStorage.setItem('briarDesignerToken', designerToken);
    if (loginPanel) loginPanel.classList.add('hidden');
    if (designerWorkspace) designerWorkspace.classList.remove('hidden');
    setMessage(designerAuthMessage, '', '');
    await loadDesignerListings();
  } catch (error) {
    designerToken = '';
    sessionStorage.removeItem('briarDesignerToken');
    setMessage(designerAuthMessage, error.message, 'error');
  }
}

function signOut() {
  designerToken = '';
  sessionStorage.removeItem('briarDesignerToken');
  if (loginPanel) loginPanel.classList.remove('hidden');
  if (designerWorkspace) designerWorkspace.classList.add('hidden');
  if (designerTokenInput) designerTokenInput.value = '';
  clearDesignerListImagePreviews();
  resetListingForm();
  setMessage(designerAuthMessage, 'Signed out.', 'success');
}

function applyFilterButtons() {
  document.querySelectorAll('.filter-button').forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderGallery();
}

if (designerLoginBtn) designerLoginBtn.addEventListener('click', () => designerModal.showModal());
if (modalClose) modalClose.addEventListener('click', () => designerModal.close());
if (designerLoginForm) designerLoginForm.addEventListener('submit', (event) => { event.preventDefault(); signIn(designerTokenInput.value); });
if (productForm) productForm.addEventListener('submit', handleSave);
if (photoInput) photoInput.addEventListener('change', (event) => addFiles(event.target.files));
byId('signout-btn')?.addEventListener('click', signOut);
byId('new-listing-btn')?.addEventListener('click', resetListingForm);
byId('product-dialog-close')?.addEventListener('click', () => productDialog.close());
cartOpenButton?.addEventListener('click', () => {
  renderCart();
  if (cartDialog && !cartDialog.open) cartDialog.showModal();
});
byId('cart-dialog-close')?.addEventListener('click', () => cartDialog.close());
byId('report-dialog-close')?.addEventListener('click', () => reportDialog.close());
if (reportForm) reportForm.addEventListener('submit', submitReport);
checkoutButton?.addEventListener('click', startCheckout);
if (searchInput) searchInput.addEventListener('input', () => { searchTerm = searchInput.value; renderGallery(); });
if (sortSelect) sortSelect.addEventListener('change', () => { sortOrder = sortSelect.value || 'featured'; renderGallery(); });

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter || 'all';
    applyFilterButtons();
  });
});

byId('newsletter-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = byId('email');
  if (email && email.value.trim()) {
    email.value = '';
    email.placeholder = 'Thanks for joining!';
  }
});

if (designerToken) {
  if (loginPanel) loginPanel.classList.add('hidden');
  if (designerWorkspace) designerWorkspace.classList.remove('hidden');
  signIn(designerToken);
}

renderCart();
Promise.all([loadStoreConfig(), loadGallery()]).then(handleCheckoutReturn);
