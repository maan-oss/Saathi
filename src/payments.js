import crypto from 'node:crypto';

// Stripe Checkout for wallet and pack top-ups.
//   Create: POST /v1/checkout/sessions (form-encoded). The answer has a hosted page URL the person pays on.
//   Paid:   webhook event "checkout.session.completed" (or "checkout.session.async_payment_succeeded" for slow methods),
//           with data.object.payment_status === "paid".
//   Signed: header "Stripe-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">", keyed with the whsec_ secret.
// The wallet is kept in paise, so every top-up is charged in INR. Stripe must accept INR for this account.

export const CURRENCY = 'inr';
// Checkout's branding_settings and custom_text need this API version or a later one. Pinned, so an older account default cannot drop them.
const STRIPE_API_VERSION = '2025-09-30.clover';
const TOLERANCE_SECONDS = 300; // Stripe's own default: refuse signatures older than five minutes
// The live catalog in Stripe: products "Saathi wallet top-up" and "Saathi Quick pack", "Saathi pack", "Saathi Plus".
// Only a live key can use these prices (a test key has none), so a test key keeps sending the amount inline.
// A price that is not in the catalog (an env override, say) is charged inline under its own name, as before.
export const LIVE_PRICES = {
  topup: { 5000: 'price_1UOZ5cRvRwVipsIhX7g5DpnX', 10000: 'price_1UOZ5lRvRwVipsIhehywp8dW', 20000: 'price_1UOZ5oRvRwVipsIhw9AtpD9J', 50000: 'price_1UOZ5wRvRwVipsIh5dKJmXEM' },
  pack: { 2900: 'price_1UOZ5GRvRwVipsIhgkSLD5RN', 4900: 'price_1UOZ5IRvRwVipsIh5y1l2hN0', 14900: 'price_1UOZ5LRvRwVipsIhTzpvF4he' },
};
const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
// Other origins the app is served from (the landing site proxies /app). A person is sent back to the origin they paid
// from, because their session lives in that origin's browser storage.
export const APP_ORIGINS = ['https://saathi-site-acme-7340.vercel.app', 'https://getsaathi.in', 'https://www.getsaathi.in'];
// Stripe's Checkout page, in Saathi's light colours. Dropped (with the custom message) if Stripe ever refuses them.
const TOPUP_MESSAGE = 'Your wallet gets the money as soon as Stripe confirms. You will be brought back to Saathi automatically.';
const PACK_MESSAGE = 'Your pack starts as soon as Stripe confirms. You will be brought back to Saathi automatically.';
function brandingFor(pack) {
  return {
    'branding_settings[display_name]': 'Saathi',
    'branding_settings[background_color]': '#FFFFFF',
    'branding_settings[button_color]': '#1D1D1F',
    'branding_settings[border_style]': 'rounded',
    'custom_text[submit][message]': pack ? PACK_MESSAGE : TOPUP_MESSAGE,
  };
}

/** The address Stripe sends the person back to: their own origin if it is one of ours, else PUBLIC_URL. */
export function returnBase(origin, publicUrl) {
  const home = String(publicUrl || '').replace(/\/+$/, '');
  let homeOrigin = '';
  try { homeOrigin = new URL(home).origin; } catch { /* no PUBLIC_URL: createLink refuses below */ }
  let o = '';
  try { o = new URL(String(origin || '')).origin; } catch { /* none sent */ }
  return o && (o === homeOrigin || APP_ORIGINS.includes(o)) ? o : home;
}

export function createPayments(config, fetchFn = fetch) {
  if (!config.stripeSecretKey) return null;
  const base = config.stripeBase || 'https://api.stripe.com';
  return {
    /** A Checkout page for one top-up (or one pack, when `pack` is true). `ref` comes back on the webhook, so the payment is credited to the right person. */
    async createLink({ ref, paise, note, origin, pack = false }) {
      if (!config.publicUrl) throw new Error('PUBLIC_URL is not set, so Stripe cannot send people back to Saathi');
      const back = returnBase(origin, config.publicUrl);
      // With a live key, a preset amount is charged at its catalog price, so the sale shows under its product in Stripe.
      const live = /^(sk|rk)_live_/.test(config.stripeSecretKey);
      const catalogPrice = live ? LIVE_PRICES[pack ? 'pack' : 'topup'][paise] : undefined;
      const item = catalogPrice
        ? { 'line_items[0][price]': catalogPrice }
        : {
            'line_items[0][price_data][currency]': CURRENCY,
            'line_items[0][price_data][unit_amount]': String(paise),
            'line_items[0][price_data][product_data][name]': note,
          };
      const fields = {
        mode: 'payment',
        client_reference_id: ref,
        success_url: `${back}/app?topup=paid&pay=${encodeURIComponent(ref)}`,
        cancel_url: `${back}/app?topup=cancelled&pay=${encodeURIComponent(ref)}`,
        'line_items[0][quantity]': '1',
        ...item,
        'phone_number_collection[enabled]': 'true', // so the receipt can be sent to a phone
      };
      const send = async (extra) => {
        const form = new URLSearchParams({ ...fields, ...extra });
        return fetchFn(`${base}/v1/checkout/sessions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.stripeSecretKey}`,
            'content-type': 'application/x-www-form-urlencoded',
            'stripe-version': STRIPE_API_VERSION,
          },
          body: form.toString(),
        });
      };
      let res = await send(brandingFor(pack));
      if (res.status === 400) {
        // A branding value Stripe does not take must not stop a payment: try again with the plain page.
        let detail = '';
        try { detail = (await res.json())?.error?.message || ''; } catch { /* no readable body */ }
        if (/branding|custom_text/i.test(detail)) res = await send({});
        else throw new Error(`stripe 400${detail ? ': ' + detail : ''}`);
      }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error?.message || ''; } catch { /* no readable body */ }
        throw new Error(`stripe ${res.status}${detail ? ': ' + detail : ''}`);
      }
      const d = await res.json();
      return { url: d.url, id: d.id };
    },
    /** Stripe's hosted receipt for a paid payment intent, or null if there is none yet. */
    async receiptUrl(paymentId) {
      if (!paymentId) return null;
      const res = await fetchFn(`${base}/v1/payment_intents/${encodeURIComponent(paymentId)}?expand[]=latest_charge`, {
        headers: { authorization: `Bearer ${config.stripeSecretKey}` },
      });
      if (!res.ok) return null;
      const d = await res.json();
      const url = d?.latest_charge?.receipt_url;
      return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
    },
  };
}

/** True when the Stripe-Signature header matches the raw body and is less than five minutes old. */
export function validStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  let time = '';
  const sigs = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') time = v;
    if (k === 'v1') sigs.push(v);
  }
  const t = Number(time);
  if (!Number.isInteger(t) || !sigs.length || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const mac = crypto.createHmac('sha256', secret);
  mac.update(`${time}.`);
  mac.update(rawBody);
  const expected = mac.digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

/** Pulls what we need out of a paid Checkout Session, or null for any other event. */
export function parsePaidEvent(body) {
  if (!PAID_EVENTS.has(body?.type)) return null;
  const s = body.data?.object;
  if (!s || s.payment_status !== 'paid' || s.currency !== CURRENCY) return null;
  const ref = s.client_reference_id;
  const paymentId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id || s.id;
  const paise = Number(s.amount_total);
  if (!ref || !paymentId || !Number.isInteger(paise) || paise <= 0) return null;
  const phone = typeof s.customer_details?.phone === 'string' ? s.customer_details.phone.replace(/\D/g, '') : '';
  return { ref, paymentId: String(paymentId), paise, phone: phone.length >= 10 ? phone : null };
}
