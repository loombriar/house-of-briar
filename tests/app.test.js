* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: 'Inter', sans-serif;
  background: #faf8f5;
  color: #1d241d;
  line-height: 1.6;
}

:root {
  --bg-card: #fffdfb;
  --bg-secondary: #efe4d5;
  --border: #e7dfd7;
  --border-strong: #d1c4b3;
  --text-dark: #1d241d;
  --text-muted: #5d665d;
  --moss-dark: #3d5b4d;
  --gold: #d0ad7b;
  --shadow-lg: 0 18px 42px rgba(27, 29, 26, 0.16);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-full: 999px;
}

a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }
button, input, select, textarea { font: inherit; }

.container { max-width: 1200px; margin: 0 auto; padding: 0 1.25rem; }
.page-shell { min-height: 100vh; }

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.1rem;
  padding-bottom: 1.1rem;
}
.brand-mark {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}
.brand-icon {
  width: 2.6rem;
  height: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--text-dark);
  color: white;
  font-family: 'Cormorant Garamond', serif;
  font-size: 2rem;
  font-weight: 700;
}
.brand-name {
  display: block;
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.5rem;
  line-height: 1;
  font-weight: 700;
}
.brand-tag {
  display: block;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.main-nav {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  font-weight: 500;
}
.main-nav a { color: var(--text-dark); }
.header-actions { display: flex; gap: 0.75rem; align-items: center; }
button, .primary-button, .secondary-button, .ghost-button {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.2s ease;
  font-weight: 600;
}
.primary-button, .secondary-button, .ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0.8rem 1.2rem;
}
.primary-button {
  background: var(--text-dark);
  color: white;
}
.secondary-button {
  background: transparent;
  color: var(--text-dark);
  border: 1px solid var(--text-dark);
}
.ghost-button {
  background: transparent;
  color: var(--text-dark);
  border: 1px solid var(--border-strong);
}
button:hover, .primary-button:hover, .secondary-button:hover, .ghost-button:hover { transform: translateY(-1px); }

.hero { padding: 3.5rem 0; background: white; }
.hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 2.5rem; align-items: center; }
.eyebrow {
  margin: 0 0 0.75rem;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 700;
}
h1, h2, h3, h4 { font-family: 'Cormorant Garamond', serif; margin: 0 0 0.6rem; line-height: 1.1; }
h1 { font-size: clamp(2.5rem, 5vw, 4rem); }
h2 { font-size: clamp(2rem, 3vw, 3rem); }
.hero-text, .story-copy p, .curation-card p, .newsletter-box h2, .product-card p, .product-detail-copy p, .empty-gallery {
  color: var(--text-muted);
}
.hero-text { font-size: 1.08rem; }
.hero-actions { display: flex; gap: 1rem; margin: 1.8rem 0; }
.trust-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  color: var(--text-muted);
}
.trust-list li::before { content: '✓'; margin-right: 0.5rem; font-weight: 700; }

.hero-visual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.card {
  background: linear-gradient(140deg, #e8ddc9, #f8eddc);
  padding: 1.5rem;
  border-radius: 16px;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: end;
}
.large-card { grid-column: 1 / -1; }
.card-label { color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em; }
.mini-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.tile {
  min-height: 150px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: linear-gradient(140deg, #d8cab0, #ede2d1);
  border-radius: 16px;
  font-family: 'Cormorant Garamond', serif;
  font-size: 1.2rem;
  padding: 1rem;
}

.feature-bar { background: #f9f5ef; padding: 2.4rem 0; }
.feature-inline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2rem;
  text-align: center;
}
.feature-inline strong { display: block; margin-bottom: 0.3rem; }
.feature-inline span { color: var(--text-muted); }

.product-section, .story-section, .curation-section, .newsletter-section { padding: 4rem 0; }
.section-heading {
  display: flex; justify-content: space-between; align-items: end; gap: 1rem; margin-bottom: 1.8rem;
}
.filter-toolbar {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.filter-button {
  padding: 0.55rem 1rem;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-dark);
  border-radius: 999px;
}
.filter-button.is-active {
  background: var(--text-dark);
  color: white;
  border-color: var(--text-dark);
}
.notice { min-height: 1.5rem; margin: 0 0 1.2rem; }
.notice[data-kind='error'] { color: #8c352d; }
.notice[data-kind='success'] { color: #2f6847; }
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}
.product-card {
  width: 100%;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  text-align: left;
  padding: 0;
  box-shadow: 0 6px 16px rgba(29, 36, 29, 0.04);
}
.product-card:hover { box-shadow: 0 16px 34px rgba(29, 36, 29, 0.1); }
.product-image {
  position: relative;
  width: 100%;
  height: 280px;
  background: linear-gradient(140deg, #eadcc5, #f5ebdc);
  overflow: hidden;
}
.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-image-fallback {
  display: grid;
  place-items: center;
  font-family: 'Cormorant Garamond', serif;
  font-size: 2rem;
  color: var(--text-dark);
}
.photo-count-badge {
  position: absolute;
  right: 0.8rem;
  top: 0.8rem;
  background: rgba(29, 36, 29, 0.8);
  color: white;
  font-size: 0.72rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
}
.product-body {
  display: block;
  padding: 1rem 1rem 1.2rem;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.badge {
  display: inline-block;
  background: #f3efe8;
  color: var(--text-muted);
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
}
.price { font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; font-weight: 700; }
.card-title {
  display: block;
  font-family: 'Cormorant Garamond', serif;
  font-size: 2rem;
  line-height: 1;
  margin-bottom: 0.25rem;
}
.card-description { display: block; margin-top: 0.35rem; }

.story-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; }
.story-visual {
  min-height: 300px;
  background: linear-gradient(140deg, #e9dec6, #f4e4cf);
  border-radius: 20px;
  display: flex;
  align-items: flex-end;
  padding: 1.5rem;
}
.story-panel { width: 100%; }
.story-copy { font-size: 1.05rem; }
.story-copy p { margin: 0 0 1rem; }

.curation-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.2rem; }
.curation-card {
  padding: 2rem 1.5rem;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 18px;
  text-align: center;
}
.curation-number {
  display: inline-block;
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.newsletter-box {
  background: #f9f5ef;
  border-radius: 22px;
  padding: 2rem;
  text-align: center;
}
.newsletter-form {
  display: flex;
  gap: 0.8rem;
  max-width: 560px;
  margin: 1rem auto 0;
}
.newsletter-form input {
  flex: 1;
  min-height: 50px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 0.8rem 1rem;
}

.site-footer {
  background: var(--text-dark);
  color: #f5f3ef;
  padding: 2.5rem 0 1.5rem;
}
.footer-inner {
  display: grid;
  grid-template-columns: 1.1fr 0.8fr 1fr;
  gap: 1rem;
  align-items: center;
}
.footer-inner .brand-name { color: white; }
.footer-copy { color: rgba(255,255,255,0.78); }
.footer-links {
  display: flex;
  justify-content: center;
  gap: 1.2rem;
}
.copyright { color: rgba(255,255,255,0.72); text-align: right; }

.app-dialog { border: none; border-radius: 18px; background: #fffdfb; box-shadow: var(--shadow-lg); width: min(760px, calc(100% - 2rem)); }
.app-dialog::backdrop { background: rgba(18, 28, 24, 0.56); }
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  border-bottom: 1px solid var(--border);
}
.icon-button {
  width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--border-strong); background: transparent; font-size: 1.8rem; cursor: pointer;
}
.login-panel, #designer-workspace { padding: 1.4rem; }
.stack-form { display: grid; gap: 0.8rem; }
.stack-form label { font-weight: 600; }
.stack-form input, .stack-form textarea, .stack-form select {
  width: 100%; min-height: 46px; border: 1px solid var(--border-strong); border-radius: 10px; padding: 0.75rem 0.9rem; background: white;
}
.stack-form textarea { resize: vertical; min-height: 120px; }
.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
.form-message { min-height: 1.2rem; margin: 0; }
.form-message[data-kind='error'] { color: #8c352d; }
.form-message[data-kind='success'] { color: #2f6847; }
.upload-heading p, .small-print { color: var(--text-muted); font-size: 0.82rem; }
.studio-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.studio-toolbar-actions { display: flex; gap: 0.75rem; align-items: center; }
.designer-products { display: grid; gap: 0.8rem; }
.designer-product-item {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
.designer-product-item img {
  width: 64px; height: 64px; object-fit: cover; border-radius: 10px; background: var(--bg-secondary);
}
.designer-product-info h4 { margin: 0; font-family: 'Inter', sans-serif; font-size: 1rem; }
.designer-product-info p { margin: 0.2rem 0 0; color: var(--text-muted); font-size: 0.8rem; }
.designer-product-actions { display: flex; align-items: center; gap: 0.5rem; }
.status-badge {
  display: inline-flex; align-items: center; justify-content: center; padding: 0.35rem 0.65rem; background: #f0eee9; color: var(--text-dark); border-radius: 999px; font-size: 0.72rem; font-weight: 700;
}
.text-button {
  border: none; background: transparent; color: var(--moss-dark); font-weight: 700; cursor: pointer;
}
.soft-rule { border: 0; border-top: 1px solid var(--border); margin: 1.2rem 0; }
.photo-preview { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.8rem; }
.photo-preview-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: white;
}
.photo-preview-item img { width: 100%; height: 150px; object-fit: cover; }
.photo-order-label {
  position: absolute;
  left: 0.6rem; top: 0.6rem;
  background: rgba(29, 36, 29, 0.8); color: white; border-radius: 999px; padding: 0.2rem 0.5rem; font-size: 0.7rem;
}
.photo-preview-item { position: relative; }
.photo-preview-meta { padding: 0.7rem; }
.photo-preview-meta strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photo-preview-meta span { color: var(--text-muted); font-size: 0.75rem; }
.photo-preview-actions { display: flex; gap: 0.4rem; justify-content: space-between; padding: 0 0.7rem 0.7rem; }
.photo-preview-actions button { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.45rem; cursor: pointer; }
.form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem; }
.hidden { display: none !important; }
.empty-gallery, .empty-state { color: var(--text-muted); margin: 1rem 0 0; }

.product-dialog { width: min(900px, calc(100% - 2rem)); }
.product-detail-content {
  display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 1rem; padding: 1.4rem;
}
.product-detail-images {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem;
}
.product-detail-images img { width: 100%; height: 170px; object-fit: cover; border-radius: 12px; }
.product-detail-images img:first-child { grid-column: 1 / -1; height: 230px; }
.product-detail-copy { display: flex; flex-direction: column; gap: 0.8rem; }
.product-detail-copy h3 { font-size: 2.2rem; }

@media (max-width: 700px) {
  .header-inner { flex-direction: column; align-items: flex-start; }
  .main-nav { flex-wrap: wrap; }
  .hero-grid, .story-grid, .feature-inline, .curation-grid, .footer-inner, .product-detail-content, .form-row { grid-template-columns: 1fr; }
  .section-heading, .studio-toolbar { flex-direction: column; align-items: flex-start; }
  .newsletter-form, .header-actions, .hero-actions, .form-actions { flex-direction: column; }
  .footer-links { justify-content: flex-start; }
  .copyright { text-align: left; }
  .designer-product-item { grid-template-columns: 56px minmax(0, 1fr); }
  .designer-product-actions { grid-column: 1 / -1; }
}

@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto; transition: none !important; }
}

button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible {
  outline: 3px solid rgba(208, 173, 123, 0.7);
  outline-offset: 2px;
}
