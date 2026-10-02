import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Search, SlidersHorizontal } from '@/lib/icons';
import { getFieldNumber, getFieldValue, getTitle, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import { getCatalogProducts, getSavedProductIds, isPublicProduct, getProductImages, getProductVisual, money, setSavedProductIds } from '@/lib/marketplace';

const LIKED_PRODUCTS_KEY = 'house-of-briar:liked-products';
const PRICE_RANGES = [
  { value: 'all-prices', label: 'All prices' },
  { value: 'under-200', label: 'Under $200' },
  { value: '200-299', label: '$200 - $299' },
  { value: '300-499', label: '$300 - $499' },
  { value: '500-plus', label: '$500 and above' },
] as const;

function matchesPriceRange(price: number, range: string) {
  if (range === 'under-200') return price < 200;
  if (range === '200-299') return price >= 200 && price < 300;
  if (range === '300-499') return price >= 300 && price < 500;
  if (range === '500-plus') return price >= 500;
  return true;
}

function getLikedProductIds() {
  const raw = window.localStorage.getItem(LIKED_PRODUCTS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function setLikedProductIds(ids: string[]) {
  window.localStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

type ProductCardProps = {
  product: GenesisNode;
  onLike: (productId: string) => void;
  liked: boolean;
  saved: boolean;
  onSave: (productId: string) => void;
};

function ProductCard({ product, onLike, liked, saved, onSave }: ProductCardProps) {
  const name = getTitle(product, 'Name') ?? 'Untitled piece';
  const price = getFieldNumber(product, '@price', 'Price') ?? 0;
  const category = getFieldValue(product, '@categ', 'Category') ?? 'One-of-a-kind';
  const designer = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
  const likes = (getFieldNumber(product, '@likes', 'Likes') ?? 0) + (liked ? 1 : 0);
  const images = getProductImages(getFieldValue(product, '@image', 'Image URL'), getFieldValue(product, '@gally', 'Gallery URLs'));
  const primaryImage = images[0];
  const hasMultipleImages = images.length > 1;
  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <Link to={`/shop/${product.id}`} className={`relative flex aspect-[4/5] items-end overflow-hidden bg-gradient-to-br ${getProductVisual(name)} p-5`}>
        {primaryImage ? <img src={primaryImage} alt={`${name} by ${designer}`} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_25%_25%,hsl(var(--primary-foreground)/.4),transparent_34%),linear-gradient(135deg,transparent_55%,hsl(var(--background)/.22))]" aria-hidden="true" />}
        <div className="absolute inset-0 bg-background/15" aria-hidden="true" />
        <div className="relative z-10 rounded-full border border-primary-foreground/25 bg-background/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-primary-foreground backdrop-blur">{category}</div>
        {hasMultipleImages && <span className="absolute bottom-5 right-5 z-10 rounded-full border border-primary-foreground/25 bg-background/75 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">{images.length} photos</span>}
        <span className="absolute right-4 top-4 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground">{getFieldValue(product, '@statx', 'Status') ?? 'Available'}</span>
      </Link>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-serif text-xl font-semibold">{name}</h2><p className="mt-1 text-sm text-muted-foreground">by {designer}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money.format(price)}</span></div>
        <div className="flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{getFieldValue(product, '@sizex', 'Size') ?? 'Made to order'}</span><div className="flex items-center gap-1"><button type="button" aria-label={`${saved ? 'Remove' : 'Save'} ${name}`} onClick={() => onSave(product.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs transition hover:bg-accent hover:text-primary ${saved ? 'text-primary' : 'text-muted-foreground'}`}><Heart size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved' : 'Save'}</button><button type="button" aria-label={`${liked ? 'Unlike' : 'Like'} ${name}`} onClick={() => onLike(product.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs transition hover:bg-accent hover:text-primary ${liked ? 'text-primary' : 'text-muted-foreground'}`}><Heart size={15} fill={liked ? 'currentColor' : 'none'} />{likes}</button></div></div>
      </div>
    </article>
  );
}

export default function ShopPage() {
  const auth = useAuth();
  const [products, setProducts] = useState<GenesisNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All pieces');
  const [priceRange, setPriceRange] = useState('all-prices');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const savedOnly = searchParams.get('liked') === 'true';
  const designerFilter = searchParams.get('designer') ?? 'All designers';
  useEffect(() => { void getCatalogProducts(auth.isAuthenticated).then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false)); setSavedIds(getSavedProductIds()); setLikedIds(getLikedProductIds()); }, [auth.isAuthenticated]);
  useEffect(() => {
    const refreshSaved = () => setSavedIds(getSavedProductIds());
    window.addEventListener('house-of-briar-saved-products', refreshSaved);
    return () => window.removeEventListener('house-of-briar-saved-products', refreshSaved);
  }, []);
  const categories = useMemo(() => ['All pieces', ...Array.from(new Set(products.map((item) => getFieldValue(item, '@categ', 'Category')).filter(Boolean) as string[]))], [products]);
  const designers = useMemo(() => ['All designers', ...Array.from(new Set(products.map((item) => getFieldValue(item, '@desig', 'Designer')).filter(Boolean) as string[])).sort()], [products]);
  const visible = products.filter((product) => {
    if (!isPublicProduct(product) || (savedOnly && !savedIds.includes(product.id))) return false;
    const name = getTitle(product, 'Name') ?? '';
    const tags = getFieldValue(product, '@tagsx', 'Tags') ?? '';
    const productDesigner = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
    const price = getFieldNumber(product, '@price', 'Price') ?? 0;
    const matchesQuery = `${name} ${tags} ${productDesigner}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === 'All pieces' || getFieldValue(product, '@categ', 'Category') === category;
    const matchesDesigner = designerFilter === 'All designers' || productDesigner === designerFilter;
    const matchesPrice = matchesPriceRange(price, priceRange);
    return matchesQuery && matchesCategory && matchesDesigner && matchesPrice;
  });
  const groupedVisible = useMemo(() => {
    const groups = new Map<string, GenesisNode[]>();
    visible.forEach((product) => {
      const designer = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
      groups.set(designer, [...(groups.get(designer) ?? []), product]);
    });
    return Array.from(groups.entries());
  }, [visible]);
  const handleSave = (productId: string) => {
    const next = savedIds.includes(productId) ? savedIds.filter((id) => id !== productId) : [...savedIds, productId];
    setSavedIds(next);
    setSavedProductIds(next);
  };
  const handleLike = (productId: string) => {
    const next = likedIds.includes(productId) ? likedIds.filter((id) => id !== productId) : [...likedIds, productId];
    setLikedIds(next);
    setLikedProductIds(next);
  };
  if (loading) return <HouseShell><section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="space-y-4 border-b border-border pb-10"><div className="h-4 w-28 animate-pulse rounded-full bg-muted" /><div className="h-14 w-3/4 animate-pulse rounded-2xl bg-muted" /><div className="h-5 w-full max-w-xl animate-pulse rounded-full bg-muted" /></div><div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />)}</div></section></HouseShell>;
  return <HouseShell><section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-6 border-b border-border pb-10 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">The collection</p><h1 className="mt-3 font-serif text-5xl leading-none sm:text-6xl">Find your singular piece.</h1><p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">Clothes and hand-painted goods with a past, a pulse, and a person behind them.</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground"><SlidersHorizontal size={16} /> {visible.length} {savedOnly ? 'saved pieces' : 'pieces'}</div></div><div className="mt-8 space-y-3"><label className="relative block"><span className="sr-only">Search pieces</span><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by piece, designer, or feeling" className="min-h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label className="block max-w-sm text-sm font-medium" htmlFor="designer-filter">Designer<select id="designer-filter" value={designerFilter} onChange={(event) => { const next = new URLSearchParams(searchParams); if (event.target.value === 'All designers') next.delete('designer'); else next.set('designer', event.target.value); setSearchParams(next); }} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">{designers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="block max-w-sm text-sm font-medium" htmlFor="category-filter">Category<select id="category-filter" value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="block max-w-sm text-sm font-medium" htmlFor="price-filter">Price range<select id="price-filter" value={priceRange} onChange={(event) => setPriceRange(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">{PRICE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}</select></label></div><div className="mt-10 space-y-12">{groupedVisible.map(([designer, designerProducts]) => <section key={designer} aria-label={`${designer} pieces`}><div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Designer collection</p><h2 className="mt-2 font-serif text-3xl">{designer}</h2></div><span className="text-sm text-muted-foreground">{designerProducts.length} available</span></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{designerProducts.map((product) => <ProductCard key={product.id} product={product} onLike={handleLike} liked={likedIds.includes(product.id)} saved={savedIds.includes(product.id)} onSave={handleSave} />)}</div></section>)}</div>{visible.length === 0 && <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center"><p className="font-serif text-2xl">The briar is quiet here.</p><p className="mt-2 text-sm text-muted-foreground">Try another search, designer, or category.</p></div>}</section></HouseShell>;
}
