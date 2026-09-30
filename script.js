const year = document.getElementById('year');
if (year) {
  year.textContent = new Date().getFullYear();
}

// ============================================
// DESIGNER PORTAL: MODAL AND UPLOAD LOGIC
// ============================================

const designerLoginBtn = document.getElementById('designer-login-btn');
const designerModal = document.getElementById('designer-modal');
const modalClose = document.getElementById('modal-close');
const productForm = document.getElementById('product-form');
const photoInput = document.getElementById('product-photos');
const photoPreview = document.getElementById('photo-preview');
const productGrid = document.getElementById('product-grid');
const designerProductsContainer = document.getElementById('designer-products');

// Open/close modal
designerLoginBtn.addEventListener('click', () => {
  designerModal.classList.remove('hidden');
  loadDesignerProducts();
});

modalClose.addEventListener('click', () => {
  designerModal.classList.add('hidden');
});

designerModal.addEventListener('click', (e) => {
  if (e.target === designerModal || e.target.classList.contains('modal-overlay')) {
    designerModal.classList.add('hidden');
  }
});

// Photo preview on file selection
photoInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  photoPreview.innerHTML = '';

  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const preview = document.createElement('div');
      preview.className = 'photo-preview-item';
      preview.innerHTML = `
        <img src="${event.target.result}" alt="Preview ${index + 1}">
        <span class="photo-count">${index + 1}</span>
      `;
      photoPreview.appendChild(preview);
    };
    reader.readAsDataURL(file);
  });
});

// Drag and drop support
const fileInputWrapper = document.querySelector('.file-input-wrapper');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  fileInputWrapper.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach((eventName) => {
  fileInputWrapper.addEventListener(eventName, () => {
    fileInputWrapper.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  fileInputWrapper.addEventListener(eventName, () => {
    fileInputWrapper.classList.remove('dragover');
  });
});

fileInputWrapper.addEventListener('drop', (e) => {
  photoInput.files = e.dataTransfer.files;
  const event = new Event('change', { bubbles: true });
  photoInput.dispatchEvent(event);
});

// Form submission
productForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const formData = new FormData(productForm);
  const files = photoInput.files;

  if (files.length === 0) {
    alert('Please upload at least one photo');
    return;
  }

  const photoPromises = Array.from(files).map((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      reader.readAsDataURL(file);
    });
  });

  Promise.all(photoPromises).then((photos) => {
    const product = {
      id: Date.now(),
      name: formData.get('name'),
      description: formData.get('description'),
      price: parseFloat(formData.get('price')),
      category: formData.get('category'),
      photos: photos,
      createdAt: new Date().toISOString(),
    };

    saveProduct(product);
    productForm.reset();
    photoPreview.innerHTML = '';
    loadDesignerProducts();
    renderProducts();
  });
});

// Save product to localStorage
function saveProduct(product) {
  const products = JSON.parse(localStorage.getItem('designerProducts')) || [];
  products.push(product);
  localStorage.setItem('designerProducts', JSON.stringify(products));
}

// Load designer products
function loadDesignerProducts() {
  const products = JSON.parse(localStorage.getItem('designerProducts')) || [];
  designerProductsContainer.innerHTML = '';

  if (products.length === 0) {
    designerProductsContainer.innerHTML = '<p class="empty-state">No products yet. Add one above!</p>';
    return;
  }

  products.forEach((product) => {
    const productEl = document.createElement('div');
    productEl.className = 'designer-product-item';
    productEl.innerHTML = `
      <div class="designer-product-preview">
        <img src="${product.photos[0]}" alt="${product.name}">
        <span class="photo-count-badge">${product.photos.length} photo${product.photos.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="designer-product-info">
        <h4>${product.name}</h4>
        <p>${product.description}</p>
        <div class="product-meta">
          <span class="category-badge">${product.category}</span>
          <span class="price">$${product.price.toFixed(2)}</span>
        </div>
      </div>
      <button class="delete-btn" data-id="${product.id}" aria-label="Delete product">Delete</button>
    `;

    designerProductsContainer.appendChild(productEl);
  });

  // Delete button handlers
  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      deleteProduct(id);
      loadDesignerProducts();
      renderProducts();
    });
  });
}

// Delete product
function deleteProduct(id) {
  let products = JSON.parse(localStorage.getItem('designerProducts')) || [];
  products = products.filter((p) => p.id !== id);
  localStorage.setItem('designerProducts', JSON.stringify(products));
}

// Render products on main shop grid
function renderProducts() {
  const products = JSON.parse(localStorage.getItem('designerProducts')) || [];
  const existingUploads = Array.from(productGrid.querySelectorAll('.product-card[data-uploaded="true"]'));
  existingUploads.forEach((el) => el.remove());

  products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.dataset.category = product.category;
    card.dataset.uploaded = 'true';
    card.innerHTML = `
      <div class="product-image product-uploaded-image" style="background-image: url('${product.photos[0]}'); background-size: cover; background-position: center;">
        ${product.photos.length > 1 ? `<span class="multi-photo-badge">${product.photos.length} photos</span>` : ''}
      </div>
      <div class="product-body">
        <div class="meta-row">
          <span class="badge">${product.category.charAt(0).toUpperCase() + product.category.slice(1)}</span>
          <span class="price">$${product.price.toFixed(2)}</span>
        </div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
      </div>
    `;
    productGrid.appendChild(card);
  });

  applyFilters();
}

// Initialize on page load
window.addEventListener('load', () => {
  renderProducts();
});

// ============================================
// ORIGINAL FILTER AND NEWSLETTER LOGIC
// ============================================

const filterButtons = document.querySelectorAll('.filter-button');
const productCards = document.querySelectorAll('.product-card');

function applyFilters() {
  const activeButton = document.querySelector('.filter-button.is-active');
  if (!activeButton) return;

  const selected = activeButton.dataset.filter;
  const allCards = document.querySelectorAll('.product-card');

  allCards.forEach((card) => {
    const matches = selected === 'all' || card.dataset.category === selected;
    card.style.display = matches ? 'block' : 'none';
  });
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selected = button.dataset.filter;

    filterButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));

    applyFilters();
  });
});

const newsletterForm = document.querySelector('.newsletter-form');
newsletterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const emailInput = newsletterForm.querySelector('input');

  if (emailInput && emailInput.value.trim()) {
    emailInput.value = '';
    emailInput.placeholder = 'Thanks for joining!';
  }
});
