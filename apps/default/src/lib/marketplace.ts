import { getNodes, type GenesisNode } from '@/lib/genesis-data';

export const PRODUCTS_PROJECT_ID = 'Jh4hJjUDzfNiMHaH';

const PUBLIC_PRODUCTS_SNAPSHOT: GenesisNode[] = [
  {
    id: '48a0cc6f-e6ac-4538-8a9f-a4889ce21c4c',
    parentId: null,
    content: 'Tulip Dress',
    fieldValues: {
      '/attributes/@price': '295',
      '/attributes/@categ': 'One-of-a-kind',
      '/attributes/@tagsx': 'Upcycled',
      '/attributes/@sizex': 'Large',
      '/attributes/@desig': 'Loom Briar',
      '/attributes/@descr': 'A one-of-a-kind upcycled Tulip Dress with a sculpted floral bodice and a flowing abstract botanical skirt. Made by Loom Briar in a size Large.',
      '/attributes/@statx': 'Available',
      '/attributes/@image': 'https://files.taskade.com/space-files/dfa11d10-4b73-432f-afba-40a94ed855b7/original/tulips-front.png',
      '/attributes/@gally': 'https://files.taskade.com/space-files/dfa11d10-4b73-432f-afba-40a94ed855b7/original/tulips-front.png\nhttps://files.taskade.com/space-files/b4b416e9-4a6d-4150-9600-216fe6d1240d/original/tulips-angle.png\nhttps://files.taskade.com/space-files/d97b38e6-dd6c-43e0-9e1a-eb1ff6e771c4/original/tulips-back.png\nhttps://files.taskade.com/space-files/31b90e78-f441-49ed-a7cd-71dd8091dae4/original/4eb67f7d-151e-4bca-bd57-a0a25e424619.png',
    },
  },
  {
    id: 'f54a0902-1b79-45a1-8009-66c9d9494e7c',
    parentId: null,
    content: 'Velvet Gold',
    fieldValues: {
      '/attributes/@price': '195',
      '/attributes/@categ': 'One-of-a-kind',
      '/attributes/@tagsx': 'Upcycled',
      '/attributes/@sizex': 'Large',
      '/attributes/@desig': 'Loom Briar',
      '/attributes/@descr': 'Hand beaded velvet top',
      '/attributes/@statx': 'Available',
      '/attributes/@image': 'https://www.taskade.com/web-api/media/2a285be0-cb9a-46c0-a624-9a3d9db127bb/download',
      '/attributes/@gally': 'https://www.taskade.com/web-api/media/a94ce5f9-370e-43f4-98a0-1707516c80e3/download',
    },
  },
  {
    id: '644e29d9-3100-43d6-b2f6-b5369bde7dc4',
    parentId: null,
    content: 'Lavender Palm Dress',
    fieldValues: {
      '/attributes/@price': '295',
      '/attributes/@categ': 'One-of-a-kind',
      '/attributes/@tagsx': 'Handmade, Statement piece, Vintage-inspired',
      '/attributes/@sizex': 'Large',
      '/attributes/@desig': 'Loom Briar',
      '/attributes/@descr': 'A sculpted lavender bodice paired with a layered asymmetrical skirt, made as wearable art with a dramatic, one-of-a-kind silhouette.',
      '/attributes/@statx': 'Available',
      '/attributes/@image': 'https://www.taskade.com/web-api/media/6c7b4a35-9eba-4452-aa70-b36d89db632b/download',
      '/attributes/@gally': 'https://www.taskade.com/web-api/media/2443e89f-14ea-460a-9583-929d1a08574f/download',
    },
  },
];

export function getCatalogProducts(isAuthenticated: boolean): Promise<GenesisNode[]> {
  return isAuthenticated ? getNodes(PRODUCTS_PROJECT_ID) : Promise.resolve(PUBLIC_PRODUCTS_SNAPSHOT);
}
export const DESIGNERS_PROJECT_ID = 'WEttcv6jabX2q9a9';
export const PRIVATE_DESIGNER_LISTINGS_PROJECT_ID = 'QUQPuN1aFvGorkJ3';
export const PRODUCT_INQUIRY_FLOW_ID = '01M3QHM2WS9696Q1CZQAN748KQ';
export const HOUSE_OF_BRIAR_AGENT_ID = '01M3PZ25F6V6H974MMAZ4Q0EX1';
export const HOUSE_OF_BRIAR_PUBLIC_AGENT_ID = 'house-of-briar-guide-01M3PZ25F8KYQ9XJP5FKY9F840';

export const MARKET_CATEGORIES = [
  'One-of-a-kind',
  'Upcycled',
  'Vintage-inspired',
  'Handmade',
  'Botanical',
  'Limited edition',
  'Statement piece',
] as const;

export const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getProductVisual(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('tulip')) return 'from-rose-950 via-primary/70 to-amber-900';
  if (normalized.includes('lavender') || normalized.includes('palm')) return 'from-violet-950 via-slate-700 to-primary';
  return 'from-primary via-emerald-900 to-amber-950';
}

export function getProductImages(imageUrl?: string | null, galleryUrls?: string | null) {
  const gallery = galleryUrls?.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean) ?? [];
  return Array.from(new Set([imageUrl?.trim(), ...gallery].filter((url): url is string => Boolean(url))));
}

export const SAVED_PRODUCTS_KEY = 'house-of-briar:saved-products';

export function getSavedProductIds() {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(SAVED_PRODUCTS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function setSavedProductIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVED_PRODUCTS_KEY, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new Event('house-of-briar-saved-products'));
}

export function isPublicProduct(product: { fieldValues: Record<string, string> }) {
  return (product.fieldValues.Status ?? product.fieldValues['/attributes/@statx'] ?? '') === 'Available';
}
