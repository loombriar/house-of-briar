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

let designerToken = sessionStorage.getItem('briarDesignerToken') || '';
let currentListingId = '';
let currentIdempotencyKey = '';
let galleryItems = [];
let selectedImages = [];
let activeFilter = 'all';
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

function makeElement(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
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

function renderGallery() {
  if (!productGrid) return;
  productGrid.replaceChildren();

  const items = galleryItems.filter((item) => activeFilter === 'all' || item.category === activeFilter);
  if (!items.length) {
    const empty = makeElement('p', 'empty-gallery', 'No published pieces are available in this category yet.');
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
    meta.appendChild(makeElement('span', 'price', `$${Number(item.price || 0).toFixed(2)}`));
    body.appendChild(meta);
    body.appendChild(makeElement('span', 'card-title', item.title));
    body.appendChild(makeElement('span', 'card-description', item.description || 'A one-of-a-kind designation from an independent designer.'));
    card.append(imageWrap, body);
    productGrid.appendChild(card);
  }
}

async function loadGallery() {
  try {
    const payload = await apiRequest('/api/gallery');
    galleryItems = Array.isArray(payload.items) ? payload.items : [];
    renderGallery();
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
  copy.appendChild(makeElement('strong', 'price', `$${Number(item.price || 0).toFixed(2)}`));
  copy.appendChild(makeElement('p', '', item.description || 'A carefully made piece from an independent designer.'));
  if (images.length > 1) copy.appendChild(makeElement('p', 'small-print', `${images.length} photos · first image is the cover`));

  productDetailContent.append(imageGrid, copy);
  productDialog.showModal();
}

function resetListingForm() {
  productForm.reset();
  currentListingId = '';
  currentIdempotencyKey = '';
  productIdInput.value = '';
  listingFormTitle.textContent = 'Add a design';
  selectedImages.forEach((item) => {
    if (item.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(item.objectUrl);
  });
  selectedImages = [];
  photoPreview.replaceChildren();
  setMessage(uploadMessage, '', '');
}

function validateSelectedImage(file) {
  const isAllowedMime = ALLOWED_MIME_TYPES.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isAllowedMime) return 'Choose a JPEG, PNG, or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Each image must be 10 MiB or smaller.';
  return '';
}

function renderSelectedImages() {
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
  photoInput.value = '';
}

function readFormValues() {
  return {
    title: byId('product-name').value.trim(),
    description: byId('product-description').value.trim(),
    price: byId('product-price').value,
    category: byId('product-category').value
  };
}

function validateListingValues(values) {
  if (!values.title || values.title.length > 120) return 'Add a design name (1–120 characters).';
  if (values.description.length > 2000) return 'Description must be 2,000 characters or fewer.';
  if (!Number.isFinite(Number(values.price)) || Number(values.price) < 0) return 'Provide a valid price.';
  if (selectedImages.length < 1) return 'At least one photo is required.';
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
  productIdInput.value = payload.item.id;
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

  const values = readFormValues();
  const validationError = validateListingValues(values);
  if (validationError) {
    setMessage(uploadMessage, validationError, 'error');
    return;
  }

  const action = event.submitter?.value || 'draft';
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

async function loadDesignerListings() {
  if (!designerToken) return;
  try {
    const payload = await apiRequest('/api/my/listings');
    clearDesignerListImagePreviews();
    designerProductsContainer.replaceChildren();
    const listings = payload.items || [];
    if (!listings.length) {
      designerProductsContainer.appendChild(makeElement('p', 'empty-state', 'No listings yet. Create a new design above.'));
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
      info.appendChild(makeElement('p', '', `${images.length} photo${images.length === 1 ? '' : 's'} · ${categoryLabel(listing.category)}`));
      row.appendChild(info);

      const actions = makeElement('div', 'designer-product-actions');
      const badge = makeElement('span', 'status-badge', listing.status === 'pending_review' ? 'Pending review' : listing.status === 'published' ? 'Published' : listing.status === 'rejected' ? 'Rejected' : 'Draft');
      actions.appendChild(badge);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.className = 'text-button';
      edit.addEventListener('click', () => editListing(listing.id));
      if (['draft', 'rejected'].includes(listing.status)) actions.appendChild(edit);
      row.appendChild(actions);
      designerProductsContainer.appendChild(row);
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
    productIdInput.value = listing.id;
    byId('product-name').value = listing.title;
    byId('product-description').value = listing.description;
    byId('product-price').value = listing.price;
    byId('product-category').value = listing.category;
    listingFormTitle.textContent = 'Edit a design';

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
    loginPanel.classList.add('hidden');
    designerWorkspace.classList.remove('hidden');
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
  loginPanel.classList.remove('hidden');
  designerWorkspace.classList.add('hidden');
  designerTokenInput.value = '';
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
  loginPanel.classList.add('hidden');
  designerWorkspace.classList.remove('hidden');
  signIn(designerToken);
}

loadGallery();
