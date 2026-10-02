import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, ArrowRight, ShoppingBag, Trash2 } from '@/lib/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { getFieldNumber, getTitle, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import { getCatalogProducts, money } from '@/lib/marketplace';

export default function CartPage() {
  const auth = useAuth();
  const [ids, setIds] = useState<string[]>([]); const [products, setProducts] = useState<GenesisNode[]>([]); const [searchParams] = useSearchParams();
  const donationState = searchParams.get('donation');
  useEffect(() => { const raw = window.localStorage.getItem('house-of-briar:cart'); setIds(raw ? JSON.parse(raw) : []); void getCatalogProducts(auth.isAuthenticated).then(setProducts).catch(() => setProducts([])); }, [auth.isAuthenticated]);
  const items = useMemo(() => {
    const quantities = new Map<string, number>();
    ids.forEach((id) => quantities.set(id, (quantities.get(id) ?? 0) + 1));
    return products.filter((item) => quantities.has(item.id)).map((item) => ({ ...item, quantity: quantities.get(item.id) ?? 1 }));
  }, [ids, products]);
  const total = items.reduce((sum, item) => sum + (getFieldNumber(item, '@price', 'Price') ?? 0) * item.quantity, 0);
  const saveCart = (next: string[]) => { setIds(next); window.localStorage.setItem('house-of-briar:cart', JSON.stringify(next)); window.dispatchEvent(new Event('house-of-briar-cart')); };
  const changeQuantity = (id: string, delta: number) => {
    const next = [...ids];
    const current = next.filter((item) => item === id).length;
    if (delta > 0) next.push(id);
    if (delta < 0 && current > 1) next.splice(next.indexOf(id), 1);
    saveCart(next);
  };
  const remove = (id: string) => saveCart(ids.filter((item) => item !== id));
  return <HouseShell><section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6"><Link to="/shop" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Continue shopping</Link><div className="mt-8 flex items-end justify-between gap-4 border-b border-border pb-6"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Your bag</p><h1 className="mt-3 font-serif text-5xl">Pieces waiting for you.</h1></div><ShoppingBag className="text-primary" size={28} /></div>{donationState === 'success' && <p role="status" className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">Thank you for supporting independent design. Stripe will send a receipt if your donation completed.</p>}{donationState === 'canceled' && <p role="status" className="mt-6 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Donation checkout was canceled. Your bag is still here when you are ready.</p>}{items.length === 0 ? <div className="py-20 text-center"><p className="font-serif text-3xl">Your bag is still a little wild.</p><p className="mt-3 text-sm text-muted-foreground">Add a piece from the collection when something speaks to you.</p><Link to="/shop" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Explore pieces <ArrowRight size={16} /></Link></div> : <><div className="divide-y divide-border">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-5 py-6"><div className="min-w-0"><Link to={`/shop/${item.id}`} className="font-serif text-2xl transition hover:text-primary">{getTitle(item, 'Name') ?? 'Untitled piece'}</Link><div className="mt-3 flex flex-wrap items-center gap-3"><div className="inline-flex min-h-11 items-center rounded-full border border-border"><button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Decrease quantity for ${getTitle(item, 'Name') ?? 'piece'}`} className="min-h-11 min-w-11 rounded-full text-lg hover:bg-accent">−</button><span className="min-w-8 text-center text-sm tabular-nums">{item.quantity}</span><button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`Increase quantity for ${getTitle(item, 'Name') ?? 'piece'}`} className="min-h-11 min-w-11 rounded-full text-lg hover:bg-accent">+</button></div><p className="text-sm text-muted-foreground">{getFieldNumber(item, '@price', 'Price') ? money.format((getFieldNumber(item, '@price', 'Price') ?? 0) * item.quantity) : 'Price to be added'}</p></div></div><button type="button" onClick={() => remove(item.id)} aria-label="Remove piece from bag" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 size={17} /></button></div>)}</div><div className="mt-8 rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Subtotal</span><span className="text-2xl font-semibold tabular-nums">{money.format(total)}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Continue to review delivery options and pay securely through Stripe. Contact and payment details stay off this app.</p><Link to="/checkout" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90">Continue to checkout <ArrowRight size={16} /></Link></div></>}</section></HouseShell>;
}
