import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, ArrowRight, BadgeCheck, CreditCard, LockKeyhole, ShieldCheck, Truck } from '@/lib/icons';
import { Link, useSearchParams } from 'react-router-dom';
import HouseShell from '@/components/HouseShell';
import { getFieldNumber, getTitle, type GenesisNode } from '@/lib/genesis-data';
import { getCatalogProducts, money } from '@/lib/marketplace';
import { createCheckoutSession, verifyCheckoutSession, type CheckoutItem } from '@/lib/stripe';

type SnapshotItem = { id: string; name: string; amount: number; quantity: number };
type CheckoutSnapshot = { ids: string[]; items: SnapshotItem[]; subtotal: number };

const CART_KEY = 'house-of-briar:cart';
const PENDING_KEY = 'house-of-briar:checkout-pending';

function readCartIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function readSnapshot(): CheckoutSnapshot | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? 'null') as CheckoutSnapshot | null;
    return value && Array.isArray(value.ids) && Array.isArray(value.items) ? value : null;
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const returnState = searchParams.get('checkout');
  const sessionId = searchParams.get('session_id');
  const [cartIds, setCartIds] = useState<string[]>(readCartIds);
  const [products, setProducts] = useState<GenesisNode[]>([]);
  const [snapshot] = useState<CheckoutSnapshot | null>(readSnapshot);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [paymentState, setPaymentState] = useState<'idle' | 'opening' | 'verifying' | 'paid' | 'cancelled' | 'failed'>(returnState === 'canceled' ? 'cancelled' : 'idle');
  const [paymentError, setPaymentError] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [activeCoupon, setActiveCoupon] = useState('');
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void getCatalogProducts(auth.isAuthenticated)
      .then((rows) => { if (active) setProducts(rows); })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'The collection could not load.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.isAuthenticated]);

  const sourceIds = returnState === 'success' && snapshot ? snapshot.ids : cartIds;
  const catalogItems = useMemo(() => {
    const quantities = new Map<string, number>();
    sourceIds.forEach((id) => quantities.set(id, (quantities.get(id) ?? 0) + 1));
    return products
      .filter((product) => quantities.has(product.id))
      .map((product) => ({
        id: product.id,
        name: getTitle(product, 'Name') ?? 'House of Briar piece',
        amount: getFieldNumber(product, '@price', 'Price') ?? 0,
        quantity: quantities.get(product.id) ?? 1,
      }));
  }, [products, sourceIds]);
  const items = returnState === 'success' && snapshot ? snapshot.items : catalogItems;
  const subtotal = returnState === 'success' && snapshot ? snapshot.subtotal : catalogItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const discountAmount = activeCoupon === 'SAVE10' ? subtotal * 0.1 : 0;
  const hasDiscount = discountAmount > 0;
  const checkoutTotal = subtotal - discountAmount;
  const hasItems = items.length > 0;
  const guestCatalog = !auth.isAuthenticated;
  const canCheckout = cartIds.length > 0 && catalogItems.length > 0 && catalogItems.every((item) => item.amount > 0) && !loading;

  useEffect(() => {
    if (returnState !== 'success') return;
    if (!sessionId) {
      setPaymentState('failed');
      setPaymentError('The payment return did not include a receipt reference, so it could not be verified.');
      return;
    }
    let active = true;
    setPaymentState('verifying');
    setPaymentError('');
    void verifyCheckoutSession(sessionId)
      .then((result) => {
        if (!active) return;
        if (!result.paid) {
          setPaymentState('failed');
          setPaymentError('Stripe has not marked this payment as paid. Your bag is unchanged.');
          return;
        }
        setPaymentState('paid');
        const purchasedIds = snapshot?.ids ?? [];
        const remaining = readCartIds().filter((id) => !purchasedIds.includes(id));
        window.localStorage.setItem(CART_KEY, JSON.stringify(remaining));
        window.localStorage.removeItem(PENDING_KEY);
        setCartIds(remaining);
        window.dispatchEvent(new Event('house-of-briar-cart'));
      })
      .catch((error) => {
        if (!active) return;
        setPaymentState('failed');
        setPaymentError(error instanceof Error ? error.message : 'Payment could not be verified.');
      });
    return () => { active = false; };
  }, [returnState, sessionId, snapshot]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError('Enter a coupon code.');
      setActiveCoupon('');
      return;
    }
    if (code !== 'SAVE10') {
      setCouponError('That coupon code is not recognized.');
      setActiveCoupon('');
      return;
    }
    setCouponInput(code);
    setActiveCoupon(code);
    setCouponError('');
  };

  const beginCheckout = async () => {
    setPaymentState('opening');
    setPaymentError('');
    const checkoutItems: CheckoutItem[] = catalogItems.map(({ name, amount, quantity }) => ({ name, amount, quantity }));
    const nextSnapshot: CheckoutSnapshot = { ids: catalogItems.map((item) => item.id), items: catalogItems, subtotal };
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(nextSnapshot));
    try {
      const url = await createCheckoutSession(checkoutItems, activeCoupon);
      window.location.assign(url);
    } catch (error) {
      window.localStorage.removeItem(PENDING_KEY);
      setPaymentState('failed');
      setPaymentError(error instanceof Error ? error.message : 'Secure checkout could not start.');
    }
  };

  const paymentComplete = paymentState === 'paid';
  const emptyBag = !loading && !hasItems && !paymentComplete;

  return <HouseShell>
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <Link to="/cart" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Back to bag</Link>
      <div className="mt-7 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">House of Briar checkout</p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl">A thoughtful final step.</h1>
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" aria-label="Checkout steps">
          <span className="rounded-full bg-accent px-4 py-2 text-accent-foreground">01 · Bag</span>
          <span className="rounded-full border border-border px-4 py-2">02 · Delivery</span>
          <span className="rounded-full border border-border px-4 py-2">03 · Payment</span>
        </div>
      </div>

      {loading && <div className="mt-8 grid gap-4 md:grid-cols-[1.3fr_0.7fr]"><div className="h-56 animate-pulse rounded-3xl bg-muted" /><div className="h-56 animate-pulse rounded-3xl bg-muted" /></div>}
      {!loading && loadError && <div role="alert" className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{loadError} <button type="button" onClick={() => window.location.reload()} className="ml-2 underline underline-offset-4">Retry</button></div>}
      {emptyBag && <div className="mt-8 rounded-3xl border border-border bg-card p-8 text-center sm:p-12"><p className="font-serif text-3xl">Your bag is waiting for a piece.</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Explore the collection <ArrowRight size={16} /></Link></div>}

      {!loading && !loadError && hasItems && <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="delivery-heading">
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><Truck size={19} /></span><div><h2 id="delivery-heading" className="font-serif text-2xl">Delivery, your way</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Choose an option in secure checkout. Your delivery address and contact details stay with Stripe.</p></div></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border p-4"><p className="font-medium">Standard</p><p className="mt-1 text-sm text-muted-foreground">5–7 business days</p><p className="mt-3 text-sm font-semibold text-primary">Free</p></div>
              <div className="rounded-2xl border border-border p-4"><p className="font-medium">Express</p><p className="mt-1 text-sm text-muted-foreground">2–3 business days</p><p className="mt-3 text-sm font-semibold text-primary">$9.99</p></div>
              <div className="rounded-2xl border border-border p-4"><p className="font-medium">Overnight</p><p className="mt-1 text-sm text-muted-foreground">Next business day</p><p className="mt-3 text-sm font-semibold text-primary">$24.99</p></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Delivery is currently available to US addresses. Exact dates are shown by Stripe after you enter your address.</p>
          </section>
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="payment-heading">
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><CreditCard size={19} /></span><div><h2 id="payment-heading" className="font-serif text-2xl">Payment that feels right</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Cards and the payment methods enabled on your Stripe account appear there, including PayPal when enabled.</p></div></div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2"><ShieldCheck size={16} /> Protected by Stripe</span><span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2"><LockKeyhole size={16} /> Card details never touch this app</span></div>
          </section>
        </div>

        <aside className="h-fit rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="summary-heading">
          {paymentComplete ? <div className="py-3 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><BadgeCheck size={28} /></span><h2 id="summary-heading" className="mt-4 font-serif text-3xl">Order confirmed</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Stripe confirmed your payment. Your bag has been cleared on this device.</p><p className="mt-3 text-xs text-muted-foreground">Receipt reference: {sessionId?.slice(-8).toUpperCase()}</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Continue shopping</Link></div> : <>
            <h2 id="summary-heading" className="font-serif text-2xl">Your order</h2>
            <div className="mt-5 divide-y divide-border">{items.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 py-4"><p className="min-w-0 truncate text-sm">{item.name} <span className="text-muted-foreground">× {item.quantity}</span></p><p className="shrink-0 text-sm font-medium tabular-nums">{money.format(item.amount * item.quantity)}</p></div>)}</div>
            <div className="mt-5 border-t border-border pt-5">
              <label htmlFor="coupon-code" className="text-sm font-medium">Coupon code</label>
              <div className="mt-2 flex gap-2"><input id="coupon-code" type="text" autoComplete="off" maxLength={24} value={couponInput} onChange={(event) => { setCouponInput(event.target.value); setActiveCoupon(''); setCouponError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoupon(); } }} aria-invalid={Boolean(couponError)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Enter SAVE10" /><button type="button" onClick={applyCoupon} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium transition hover:border-primary hover:text-primary">Apply</button></div>
              {couponError && <p role="alert" className="mt-2 text-sm text-destructive">{couponError}</p>}
              {activeCoupon === 'SAVE10' && <p role="status" className="mt-2 text-sm text-primary">SAVE10 applied: 10% off your items.</p>}
            </div>
            <div className="mt-5 flex items-center justify-between"><span className="text-sm text-muted-foreground">Item subtotal</span><span className="text-sm tabular-nums">{money.format(subtotal)}</span></div>
            {hasDiscount && <div className="mt-2 flex items-center justify-between text-sm text-primary"><span>SAVE10 discount</span><span className="tabular-nums">−{money.format(discountAmount)}</span></div>}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-4"><span className="text-sm font-medium">Items total</span><span className="text-xl font-semibold tabular-nums">{money.format(checkoutTotal)}</span></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Delivery is added in Stripe. Other promo codes must already be active in your Stripe account.</p>
            {paymentState === 'cancelled' && <p role="status" className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">Checkout was canceled. Your bag is still here.</p>}
            {(paymentState === 'failed' || paymentError) && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{paymentError}</p>}
            {guestCatalog && <p role="status" className="mt-4 text-sm leading-6 text-muted-foreground">Guest checkout uses the public catalog prices, which may not reflect recent changes. Please review the total in Stripe before paying.</p>}
            <button type="button" onClick={() => void beginCheckout()} disabled={!canCheckout || paymentState === 'opening' || paymentState === 'verifying'} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">{paymentState === 'opening' ? 'Opening secure checkout…' : 'Continue to secure checkout'} <ArrowRight size={16} /></button>
            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">By continuing, you’ll enter a secure Stripe checkout. Promo codes must be active in your Stripe account.</p>
          </>}
        </aside>
      </div>}
    </section>
  </HouseShell>;
}
