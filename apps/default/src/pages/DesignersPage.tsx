import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowUpRight, BadgeCheck, Sparkles } from '@/lib/icons';
import { Link } from 'react-router-dom';
import { getFieldValue, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import { getCatalogProducts } from '@/lib/marketplace';

type DesignerProfile = {
  name: string;
  bio: string;
  pieceCount: number;
  hasAvailablePiece: boolean;
};

function buildDesignerProfiles(products: GenesisNode[]) {
  const profiles = new Map<string, DesignerProfile>();
  products.forEach((product) => {
    const name = getFieldValue(product, '@desig', 'Designer')?.trim();
    if (!name) return;
    const status = getFieldValue(product, '@statx', 'Status') ?? '';
    const current = profiles.get(name);
    profiles.set(name, {
      name,
      bio: current?.bio || getFieldValue(product, '@descr', 'Description') || 'This studio is still writing its story.',
      pieceCount: (current?.pieceCount ?? 0) + 1,
      hasAvailablePiece: Boolean(current?.hasAvailablePiece || status === 'Available'),
    });
  });
  return Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default function DesignersPage() {
  const auth = useAuth();
  const [products, setProducts] = useState<GenesisNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const designers = useMemo(() => buildDesignerProfiles(products), [products]);

  useEffect(() => {
    let active = true;
    void getCatalogProducts(auth.isAuthenticated)
      .then((items) => {
        if (!active) return;
        setProducts(items);
        setError(false);
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth.isAuthenticated]);

  return <HouseShell>
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary"><Sparkles size={15} /> The people behind the pieces</p>
        <h1 className="mt-4 font-serif text-6xl leading-none">Meet the designers.</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">House of Briar is a collection of small worlds, each one shaped by a maker with a point of view.</p>
      </div>
      <section className="mt-10 rounded-3xl border border-border bg-accent/30 p-6 sm:p-8" aria-labelledby="badge-guide-title">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">A little house language</p>
          <h2 id="badge-guide-title" className="mt-3 font-serif text-3xl">What the badges mean.</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div><span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">Founding designer</span><p className="mt-3 text-sm leading-6 text-muted-foreground">One of the first independent makers to help shape House of Briar from the beginning.</p></div>
            <div><span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><BadgeCheck size={14} /> Community donor</span><p className="mt-3 text-sm leading-6 text-muted-foreground">A designer who has chosen to support the marketplace and its creative community through a donation.</p></div>
          </div>
        </div>
      </section>
      {loading && <div className="mt-12 grid gap-6 md:grid-cols-2" aria-label="Loading designers"><div className="h-72 animate-pulse rounded-3xl bg-muted" /><div className="h-72 animate-pulse rounded-3xl bg-muted" /></div>}
      {!loading && error && <div className="mt-12 rounded-3xl border border-dashed border-border p-10 text-center"><p className="font-serif text-2xl">The designers are taking a quiet moment.</p><p className="mt-2 text-sm text-muted-foreground">Sign in again or refresh this page to view the studios behind the collection.</p></div>}
      {!loading && !error && designers.length === 0 && <div className="mt-12 rounded-3xl border border-dashed border-border p-10 text-center"><p className="font-serif text-2xl">No studios are listed yet.</p><p className="mt-2 text-sm text-muted-foreground">New designer listings will appear here when they are available.</p></div>}
      {!loading && !error && designers.length > 0 && <div className="mt-12 grid gap-6 md:grid-cols-2">{designers.map((designer) => <article key={designer.name} className="rounded-3xl border border-border bg-card p-7 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex size-16 items-center justify-center rounded-2xl bg-accent font-serif text-2xl text-primary">{designer.name.slice(0, 1)}</div><div className="flex flex-wrap justify-end gap-2"><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">Founding designer</span>{designer.hasAvailablePiece && <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{designer.pieceCount} available {designer.pieceCount === 1 ? 'piece' : 'pieces'}</span>}</div></div><h2 className="mt-7 font-serif text-3xl">{designer.name}</h2><p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">{designer.bio}</p><div className="mt-7 flex flex-wrap gap-3"><Link to={`/shop?designer=${encodeURIComponent(designer.name)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Shop their pieces <ArrowUpRight size={16} /></Link></div></article>)}</div>}
    </section>
  </HouseShell>;
}
