import crypto from 'node:crypto';

// Razorpay Payment Links. Untested against the live API (no keys in the build sandbox); the webhook
// signature check is tested with locally computed signatures.
// Docs: POST /v1/payment_links, event "payment_link.paid", header X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret).

export function createPayments(config, fetchFn = fetch) {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) return null;
  const auth = 'Basic ' + Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  return {
    async createLink({ ref, paise, note }) {
      const res = await fetchFn(`${config.razorpayBase || 'https://api.razorpay.com'}/v1/payment_links`, {
        method: 'POST',
        headers: { authorization: auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: paise, // paise
          currency: 'INR',
          accept_partial: false,
          reference_id: ref,
          description: note,
          notify: { sms: false, email: false },
          reminder_enable: false,
        }),
      });
      if (!res.ok) throw new Error(`razorpay ${res.status}`);
      const d = await res.json();
      return { url: d.short_url, id: d.id };
    },
  };
}

export function validRazorpaySignature(rawBody, header, secret) {
  if (!secret || !header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Pulls what we need out of a payment_link.paid event, or null if it is another event. */
export function parsePaidEvent(body) {
  if (body?.event !== 'payment_link.paid') return null;
  const link = body.payload?.payment_link?.entity;
  const pay = body.payload?.payment?.entity;
  const ref = link?.reference_id;
  const paymentId = pay?.id;
  const paise = Number(pay?.amount ?? link?.amount_paid ?? 0);
  if (!ref || !paymentId || !Number.isInteger(paise)) return null;
  return { ref, paymentId, paise };
}
