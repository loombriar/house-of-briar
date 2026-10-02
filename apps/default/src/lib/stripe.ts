import { GenesisClient } from '@taskade/genesis-client';

const SPACE_ID = 'p21cwbmqlmsz6clh';
const stripe = new GenesisClient({ spaceId: SPACE_ID });

export type CheckoutItem = {
  name: string;
  amount: number;
  quantity?: number;
};

function formBody(entries: Record<string, string | number>) {
  const body = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => body.set(key, String(value)));
  return body.toString();
}

async function stripeRequest(path: string, entries: Record<string, string | number>) {
  const response = await stripe.proxy({
    secretAlias: 'stripe',
    url: `https://api.stripe.com/v1/${path}`,
    method: 'POST',
    headers: {
      Authorization: 'Bearer {{secret}}',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody(entries),
  });

  if (!response.ok) {
    const detail = await response.text();
    let message = detail || 'Stripe could not complete the request.';
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string; code?: string } };
      const stripeMessage = parsed.error?.message;
      const stripeCode = parsed.error?.code;
      if (stripeMessage) {
        message = stripeCode ? `${stripeMessage} (${stripeCode})` : stripeMessage;
      }
    } catch {
      // Keep the upstream text when Stripe does not return JSON.
    }
    throw new Error(`Stripe request failed (${response.status}): ${message}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

function returnUrls(kind: 'checkout' | 'donation') {
  if (kind === 'checkout') {
    return {
      success_url: `${window.location.origin}/checkout?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${window.location.origin}/checkout?checkout=canceled`,
    };
  }
  return {
    success_url: `${window.location.origin}/cart?donation=success`,
    cancel_url: `${window.location.origin}/cart?donation=canceled`,
  };
}

export async function createCheckoutSession(items: CheckoutItem[], couponCode = '') {
  const validItems = items.filter((item) => item.amount > 0 && item.name.trim());
  if (validItems.length === 0) throw new Error('Add a priced piece before checking out.');

  const code = couponCode.trim().toUpperCase();
  if (code && code !== 'SAVE10') throw new Error('That coupon code is not recognized.');
  const entries: Record<string, string | number> = {
    mode: 'payment',
    ...returnUrls('checkout'),
    'phone_number_collection[enabled]': 'true',
    'shipping_address_collection[allowed_countries][0]': 'US',
  };
  if (code === 'SAVE10') {
    const couponResponse = await stripe.proxy({
      secretAlias: 'stripe',
      url: 'https://api.stripe.com/v1/coupons/SAVE10',
      method: 'GET',
      headers: { Authorization: 'Bearer {{secret}}' },
    });
    if (couponResponse.status === 404) {
      await stripeRequest('coupons', { id: 'SAVE10', percent_off: 10, duration: 'once' });
    } else if (!couponResponse.ok) {
      throw new Error('Stripe could not validate the SAVE10 coupon.');
    } else {
      const coupon = await couponResponse.json() as { percent_off?: number; duration?: string; deleted?: boolean };
      if (coupon.percent_off !== 10 || coupon.duration !== 'once' || coupon.deleted) {
        throw new Error('SAVE10 already exists in Stripe with different settings.');
      }
    }
    entries['discounts[0][coupon]'] = 'SAVE10';
  } else {
    entries.allow_promotion_codes = 'true';
  }
  const shippingMethods = [
    { name: 'Standard Shipping', amount: 0, minimumDays: 5, maximumDays: 7 },
    { name: 'Express Shipping', amount: 999, minimumDays: 2, maximumDays: 3 },
    { name: 'Overnight', amount: 2499, minimumDays: 1, maximumDays: 1 },
  ];
  shippingMethods.forEach((method, index) => {
    const prefix = `shipping_options[${index}][shipping_rate_data]`;
    entries[`${prefix}[type]`] = 'fixed_amount';
    entries[`${prefix}[display_name]`] = method.name;
    entries[`${prefix}[fixed_amount][currency]`] = 'usd';
    entries[`${prefix}[fixed_amount][amount]`] = method.amount;
    entries[`${prefix}[delivery_estimate][minimum][unit]`] = 'business_day';
    entries[`${prefix}[delivery_estimate][minimum][value]`] = method.minimumDays;
    entries[`${prefix}[delivery_estimate][maximum][unit]`] = 'business_day';
    entries[`${prefix}[delivery_estimate][maximum][value]`] = method.maximumDays;
  });
  validItems.forEach((item, index) => {
    entries[`line_items[${index}][price_data][currency]`] = 'usd';
    entries[`line_items[${index}][price_data][product_data][name]`] = item.name;
    entries[`line_items[${index}][price_data][unit_amount]`] = Math.round(item.amount * 100);
    entries[`line_items[${index}][quantity]`] = item.quantity ?? 1;
  });

  const session = await stripeRequest('checkout/sessions', entries);
  const url = typeof session.url === 'string' ? session.url : null;
  if (!url) throw new Error('Stripe did not return a checkout link.');
  return url;
}

export async function verifyCheckoutSession(sessionId: string) {
  if (!sessionId.startsWith('cs_')) throw new Error('The checkout receipt reference is not valid.');
  const response = await stripe.proxy({
    secretAlias: 'stripe',
    url: `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    method: 'GET',
    headers: { Authorization: 'Bearer {{secret}}' },
  });
  if (!response.ok) throw new Error('Stripe could not verify the payment. Please retry or contact the shop.');
  const session = await response.json() as { payment_status?: string; status?: string };
  return { paid: session.payment_status === 'paid' && session.status === 'complete' };
}

export async function createDonationSession(amount: number) {
  if (!Number.isFinite(amount) || amount < 1) throw new Error('Choose a donation of at least $1.');
  const entries: Record<string, string | number> = {
    mode: 'payment',
    ...returnUrls('donation'),
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'House of Briar donation',
    'line_items[0][price_data][unit_amount]': Math.round(amount * 100),
    'line_items[0][quantity]': 1,
  };
  const session = await stripeRequest('checkout/sessions', entries);
  const url = typeof session.url === 'string' ? session.url : null;
  if (!url) throw new Error('Stripe did not return a donation link.');
  return url;
}

export async function createRefund(chargeOrPaymentIntent: string, reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' = 'requested_by_customer') {
  if (!chargeOrPaymentIntent.trim()) throw new Error('Enter a Stripe charge or payment intent ID.');
  const key = chargeOrPaymentIntent.startsWith('ch_') ? 'charge' : 'payment_intent';
  return stripeRequest('refunds', { [key]: chargeOrPaymentIntent, reason });
}
