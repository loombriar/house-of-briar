import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, Heart, Mail, Ruler, ShoppingBag, Sparkles } from '@/lib/icons';
import { Link, useParams } from 'react-router-dom';
import { getFieldNumber, getFieldValue, getTitle, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import InquiryForm from '@/components/InquiryForm';
import { getCatalogProducts, getSavedProductIds, getProductImages, getProductVisual, money, setSavedProductIds, slugify } from '@/lib/marketplace';

export default function ProductPage() {
  const auth = useAuth();
  const { productId } = useParams();
  const [product, setProduct] = useState<GenesisNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setActiveImageIndex(0);
    setLoading(true);
    void getCatalogProducts(auth.isAuthenticated)
      .then((items) => {
        setProduct(items.find((item) => item.id === productId || slugify(getTitle(item, 'Name') ?? '') === productId) ?? null);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId, auth.isAuthenticated]);

  useEffect(() => {
    if (productId == null) return;
    setSaved(getSavedProductIds().includes(productId));
    const refreshSaved = () => setSaved(getSavedProductIds().includes(productId));
    window.addEventListener('house-of-briar-saved-products', refreshSaved);
    return () => window.removeEventListener('house-of-briar-saved-products', refreshSaved);
  }, [productId]);

  if (loading) {
    return <HouseShell><section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8"><div className="aspect-[4/5] animate-pulse rounded-[2rem] bg-muted" /><div className="space-y-5 py-8"><div className="h-4 w-28 animate-pulse rounded-full bg-muted" /><div className="h-16 w-4/5 animate-pulse rounded-2xl bg-muted" /><div className="h-5 w-1/3 animate-pulse rounded-full bg-muted" /><div className="h-24 w-full animate-pulse rounded-2xl bg-muted" /><div className="h-12 w-full animate-pulse rounded-full bg-muted" /></div></section></HouseShell>;
  }

  if (!product) {
    return <HouseShell><div className="mx-auto max-w-3xl px-4 py-24 text-center"><p className="font-serif text-3xl">This piece is still finding its way here.</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Back to collection</Link></div></HouseShell>;
  }

  const name = getTitle(product, 'Name') ?? 'Untitled piece';
  const designer = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
  const availability = getFieldValue(product, '@statx', 'Status') ?? 'Available';
  const isAvailable = availability === 'Available';
  const email = auth.isAuthenticated && designer === 'Loom Briar' ? 'geekgirl1039@gmail.com' : '';
  const description = getFieldValue(product, '@descr', 'Description') ?? 'A one-of-a-kind piece made with intention.';
  const category = getFieldValue(product, '@categ', 'Category') ?? 'One-of-a-kind';
  const size = getFieldValue(product, '@sizex', 'Size') ?? 'Made to order';
  const tags = getFieldValue(product, '@tagsx', 'Tags') ?? 'Made with intention';
  const images = getProductImages(getFieldValue(product, '@image', 'Image URL'), getFieldValue(product, '@gally', 'Gallery URLs'));
  const primaryImage = images[activeImageIndex] ?? images[0];
  const hasGallery = images.length > 1;

  const addToCart = () => {
    const raw = window.localStorage.getItem('house-of-briar:cart');
    const items: string[] = raw ? JSON.parse(raw) : [];
    if (!items.includes(product.id)) items.push(product.id);
    window.localStorage.setItem('house-of-briar:cart', JSON.stringify(items));
    window.dispatchEvent(new Event('house-of-briar-cart'));
  };

  const toggleSaved = () => {
    const next = saved ? getSavedProductIds().filter((id) => id !== product.id) : [...getSavedProductIds(), product.id];
    setSaved(!saved);
    setSavedProductIds(next);
  };

  return <HouseShell>
    <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.05fr_.95fr] lg:px-8">
      <div>
        <div className={`relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br ${getProductVisual(name)} p-3 shadow-2xl sm:p-7`}>
          {primaryImage ? <img src={primaryImage} alt={`${name} by ${designer}`} className="size-full rounded-[1.5rem] object-cover" /> : <div className="flex h-full items-end rounded-[1.5rem] border border-primary-foreground/20 bg-background/10 p-6 backdrop-blur-sm"><span className="rounded-full border border-primary-foreground/20 bg-background/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-primary-foreground">{category}</span></div>}
          <div className="absolute left-7 top-7 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-background/20 px-3 py-2 text-xs uppercase tracking-[0.16em] text-primary-foreground backdrop-blur"><Sparkles size={14} /> One of one</div>
        </div>
        {hasGallery && <div className="mt-3 grid grid-cols-3 gap-3">{images.map((image, index) => <button key={image} type="button" onClick={() => setActiveImageIndex(index)} aria-label={`Show ${name} photo ${index + 1}`} aria-pressed={activeImageIndex === index} className="min-h-11 min-w-11 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><img src={image} alt={`${name} view ${index + 1}`} className={`aspect-square w-full rounded-xl border object-cover ${activeImageIndex === index ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`} /></button>)}</div>}
      </div>
      <div className="flex flex-col justify-center">
        <Link to="/shop" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Back to collection</Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.24em] text-primary">{designer}</p>
        <h1 className="mt-3 font-serif text-5xl leading-none sm:text-6xl">{name}</h1>
        <div className="mt-6 flex flex-wrap items-center gap-4"><span className="text-2xl font-semibold tabular-nums">{money.format(getFieldNumber(product, '@price', 'Price') ?? 0)}</span><span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-foreground"><Ruler size={15} /> {size}</span></div>
        <p className="mt-7 max-w-xl text-base leading-8 text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={addToCart} disabled={!isAvailable} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><ShoppingBag size={17} /> {isAvailable ? 'Add to bag' : 'Currently unavailable'}</button><button type="button" onClick={toggleSaved} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-6 text-sm font-medium transition hover:border-primary hover:text-primary ${saved ? 'text-primary' : ''}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save piece'}</button></div>
        {email && <a href={`mailto:${email}?subject=Question about ${encodeURIComponent(name)}`} className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><Mail size={16} /> Message the designer</a>}
        <dl className="mt-12 grid grid-cols-2 gap-5 border-t border-border pt-6 text-sm"><div><dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Category</dt><dd className="mt-2">{category}</dd></div><div><dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Availability</dt><dd className="mt-2 text-primary">{availability}</dd></div><div className="col-span-2"><dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Tags</dt><dd className="mt-2 leading-6">{tags}</dd></div></dl>
      </div>
    </section>
    <section className="border-t border-border bg-accent/20"><div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">A closer conversation</p><h2 className="mt-3 font-serif text-4xl">Questions are part of the piece.</h2><p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">Every garment has a maker behind it. Send a note when you want the human details before you decide.</p></div><InquiryForm productName={name} /></div></section>
  </HouseShell>;
}
