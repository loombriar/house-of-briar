import { Link, NavLink } from 'react-router-dom';
import { Heart, Menu as MenuIcon, Moon, ShoppingBag, Sun, X as CloseIcon } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { FloatingAgentChat } from '@/components/blocks';
import { HOUSE_OF_BRIAR_AGENT_ID, HOUSE_OF_BRIAR_PUBLIC_AGENT_ID } from '@/lib/marketplace';
import { createDonationSession } from '@/lib/stripe';

function DonationCard() {
  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const donate = async () => {
    setLoading(true);
    setError('');
    try {
      const url = await createDonationSession(amount);
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Stripe could not start the donation.');
      setLoading(false);
    }
  };

  return <div className="rounded-2xl border border-border bg-background/60 p-5">
    <p className="font-serif text-xl">Keep the briar growing</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Your donation supports the independent marketplace and the people making it by hand.</p>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Donation amount">
      {[10, 25, 50].map((value) => <button key={value} type="button" onClick={() => setAmount(value)} className={`min-h-11 rounded-full border px-4 text-sm transition ${amount === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>${value}</button>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <button type="button" onClick={() => void donate()} disabled={loading} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{loading ? 'Opening Stripe…' : `Donate ${moneyLabel(amount)}`}</button>
  </div>;
}

function moneyLabel(amount: number) {
  return `$${amount}`;
}

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="min-h-11 min-w-11" aria-hidden="true" />;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export default function HouseShell({ children }: { children: React.ReactNode }) {
  const [cartCount, setCartCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    const refresh = () => {
      const stored = window.localStorage.getItem('house-of-briar:cart');
      setCartCount(stored ? JSON.parse(stored).length : 0);
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('house-of-briar-cart', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('house-of-briar-cart', refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <Link to="/" className="group flex min-w-0 items-center gap-2 sm:gap-3" aria-label="House of Briar home">
            <img src="https://files.taskade.com/space-files/dcdb0306-5408-4b6e-9f03-5548f7a3e865/original/house-of-briar-crest.png" alt="House of Briar crest" className="size-10 shrink-0 rounded-full border border-primary/30 object-cover shadow-sm transition group-hover:rotate-3" />
            <span className="min-w-0 leading-none">
              <span className="block truncate font-serif text-base font-semibold tracking-wide sm:text-lg">House of Briar</span>
              <span className="mt-1 block whitespace-nowrap text-[8px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[9px] sm:tracking-[0.16em]">Made by someone, not everyone.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Primary navigation">
            <NavLink to="/shop" className={({ isActive }) => isActive ? 'font-medium text-primary' : 'text-muted-foreground transition hover:text-foreground'}>Shop</NavLink>
            <NavLink to="/designers" className={({ isActive }) => isActive ? 'font-medium text-primary' : 'text-muted-foreground transition hover:text-foreground'}>Designers</NavLink>
            <NavLink to="/account" className={({ isActive }) => isActive ? 'font-medium text-primary' : 'text-muted-foreground transition hover:text-foreground'}>Your studio</NavLink>
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link to="/shop?liked=true" aria-label="Saved pieces" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"><Heart size={17} /></Link>
            <Link to="/cart" aria-label={`Shopping bag with ${cartCount} items`} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"><ShoppingBag size={17} />{cartCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{cartCount}</span>}</Link>
            <span className="hidden sm:inline-flex"><ThemeButton /></span>
            <button type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={() => setMobileNavOpen((open) => !open)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary md:hidden">
              {mobileNavOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen && <nav id="mobile-navigation" className="border-t border-border/70 px-4 py-3 md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 text-sm">
            <NavLink to="/shop" onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `rounded-lg px-3 py-3 ${isActive ? 'bg-accent font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>Shop</NavLink>
            <NavLink to="/designers" onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `rounded-lg px-3 py-3 ${isActive ? 'bg-accent font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>Designers</NavLink>
            <NavLink to="/account" onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `rounded-lg px-3 py-3 ${isActive ? 'bg-accent font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>Your studio</NavLink>
            <div className="mt-2 border-t border-border/70 pt-2 sm:hidden"><ThemeButton /></div>
          </div>
        </nav>}
      </header>
      <main>{children}</main>
      <footer className="border-t border-border/70 bg-card/30">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
          <div>
            <p className="font-serif text-2xl">A world woven from moonlight, moss, and imagination.</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">We celebrate independent designers, slow-made pieces, and the beauty of being different.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
            <div className="mt-4 flex flex-col gap-3 text-sm"><Link to="/shop" className="transition hover:text-primary">Shop the collection</Link><Link to="/designers" className="transition hover:text-primary">Meet the designers</Link><Link to="/account" className="transition hover:text-primary">List your work</Link></div>
          </div>
          <DonationCard />
        </div>
      </footer>
      <FloatingAgentChat agentId={HOUSE_OF_BRIAR_AGENT_ID} publicAgentId={HOUSE_OF_BRIAR_PUBLIC_AGENT_ID} />
    </div>
  );
}
