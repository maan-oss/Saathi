import crypto from 'node:crypto';

// Stripe Checkout for wallet and pack top-ups.
//   Create: POST /v1/checkout/sessions (form-encoded). The answer has a hosted page URL the person pays on.
//   Paid:   webhook event "checkout.session.completed" (or "checkout.session.async_payment_succeeded" for slow methods),
//           with data.object.payment_status === "paid".
//   Signed: header "Stripe-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">", keyed with the whsec_ secret.
// The wallet is kept in paise, so every top-up is charged in INR. Stripe must accept INR for this account.

export const CURRENCY = 'inr';
const TOLERANCE_SECONDS = 300; // Stripe's own default: refuse signatures older than five minutes
const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

export function createPayments(config, fetchFn = fetch) {
  if (!config.stripeSecretKey) return null;
  const base = config.stripeBase || 'https://api.stripe.com';
  return {
    async createLink({ ref, paise, note }) {
      if (!config.publicUrl) throw new Error('PUBLIC_URL is not set, so Stripe cannot send people back to Saathi');
      const form = new URLSearchParams({
        mode: 'payment',
        client_reference_id: ref,
        success_url: `${config.publicUrl}/app?topup=paid`,
        cancel_url: `${config.publicUrl}/app?topup=cancelled`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': CURRENCY,
        'line_items[0][price_data][unit_amount]': String(paise),
        'line_items[0][price_data][product_data][name]': note,
      });
      const res = await fetchFn(`${base}/v1/checkout/sessions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.stripeSecretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error?.message || ''; } catch { /* no readable body */ }
        throw new Error(`stripe ${res.status}${detail ? ': ' + detail : ''}`);
      }
      const d = await res.json();
      return { url: d.url, id: d.id };
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
  return { ref, paymentId: String(paymentId), paise };
}
