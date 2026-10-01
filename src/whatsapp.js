// WhatsApp Cloud API client. With no token configured it runs in dry-run mode and just prints.
import { plain } from './rich.js';

const cut = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

/**
 * Turns one engine reply (string or rich object) into one or more Cloud API message payloads.
 * Limits: button title 20, max 3 buttons; list button 20, row title 24, row description 72, max 10 rows;
 * interactive body 1024.
 */
export function buildPayloads(to, reply, cfg = {}) {
  const base = { messaging_product: 'whatsapp', to };
  const text = (body) => ({ ...base, type: 'text', text: { body: cut(body, 4096), preview_url: false } });
  if (typeof reply === 'string') return [text(reply)];

  const out = [];
  let body = reply.body || '';
  const shortBody = (b) => {
    if (b.length <= 1024) return b;
    out.push(text(b)); // too long for a card: send it as text, then the buttons under a short line
    return '👇';
  };

  if (reply.kind === 'sheet') return [text(reply.text)];
  if (reply.kind === 'secret') return [text(reply.body)];

  if (reply.kind === 'buttons') {
    if (reply.buttons.length > 3) return buildPayloads(to, { kind: 'list', body, button: '…', rows: reply.buttons.map((b) => ({ id: b.id, title: b.title })) }, cfg);
    out.push({
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: shortBody(body) },
        action: { buttons: reply.buttons.map((b) => ({ type: 'reply', reply: { id: cut(b.id, 256), title: cut(b.title, 20) } })) },
      },
    });
    return out;
  }

  if (reply.kind === 'list') {
    const b = shortBody(body);
    const card = {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: b },
        action: {
          button: cut(reply.button || 'Choose', 20),
          sections: [
            {
              title: 'Options',
              rows: reply.rows.slice(0, 10).map((r) => ({
                id: cut(r.id, 200),
                title: cut(r.title, 24),
                ...(r.description ? { description: cut(r.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    };
    return out.length ? [out[0], card] : [card];
  }

  if (reply.kind === 'form') {
    if (!cfg.detailsFlowId) return [text(plain(reply))];
    const data = {};
    for (const f of reply.fields) data[f.key] = String(reply.values?.[f.key] ?? '');
    const b = shortBody(body);
    const card = {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: b },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: cfg.detailsFlowId,
            flow_token: `saathi-${reply.id}`,
            flow_cta: cut(reply.cta || 'Open', 20),
            flow_action: 'navigate',
            flow_action_payload: { screen: 'DETAILS', data },
          },
        },
      },
    };
    return out.length ? [out[0], card] : [card];
  }

  return [text(plain(reply))];
}

/** Turns one inbound webhook message into an engine input. */
export function parseInbound(msg) {
  if (msg.type === 'text') return { type: 'text', text: msg.text?.body || '' };
  if (msg.type === 'image') return { type: 'image', mediaId: msg.image?.id };
  if (msg.type === 'audio') return { type: 'voice', mediaId: msg.audio?.id, mime: msg.audio?.mime_type || '' };
  if (msg.type === 'document') return { type: 'document', mediaId: msg.document?.id, mime: (msg.document?.mime_type || '').toLowerCase(), filename: msg.document?.filename || '' };
  if (msg.type === 'interactive') {
    const i = msg.interactive || {};
    if (i.type === 'button_reply') return { type: 'reply', id: i.button_reply?.id || '', title: i.button_reply?.title || '' };
    if (i.type === 'list_reply') return { type: 'reply', id: i.list_reply?.id || '', title: i.list_reply?.title || '' };
    if (i.type === 'nfm_reply') {
      let values = {};
      try {
        values = JSON.parse(i.nfm_reply?.response_json || '{}');
      } catch {
        /* empty */
      }
      const { flow_token, ...rest } = values;
      return { type: 'form', id: String(flow_token || '').replace(/^saathi-/, '') || 'details', values: rest };
    }
  }
  if (msg.type === 'button') return { type: 'reply', id: msg.button?.payload || '', title: msg.button?.text || '' };
  return { type: 'other' };
}

export function createWhatsApp(config) {
  const base = `${config.graphBase || 'https://graph.facebook.com'}/${config.graphVersion}`;
  const auth = { authorization: `Bearer ${config.whatsappToken}` };

  return {
    /** Sends one engine reply. Returns how many WhatsApp messages actually went out (for cost counting). */
    async send(to, reply) {
      if (config.dryRun) {
        const kind = typeof reply === 'string' ? '' : ` ${reply.kind}`;
        console.log(`[dry-run${kind} → ${to.slice(-4).padStart(to.length, '•')}]\n${plain(reply)}\n`);
        return 1;
      }
      let sent = 0;
      for (const payload of buildPayloads(to, reply, config)) {
        const res = await fetch(`${base}/${config.phoneId}/messages`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error('WhatsApp send failed', res.status, (await res.text()).slice(0, 200));
          break;
        }
        sent++;
      }
      return sent;
    },

    /**
     * Sends an approved template. Needed for anything sent after the 24-hour window has closed.
     * params are the body variables in order. Returns true when WhatsApp accepted it.
     */
    async sendTemplate(to, { name, lang = 'en', params = [] }) {
      if (config.dryRun) {
        console.log(`[dry-run template ${name}/${lang} → ${to.slice(-4).padStart(to.length, '•')}] ${params.join(' | ')}\n`);
        return true;
      }
      const res = await fetch(`${base}/${config.phoneId}/messages`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name,
            language: { code: lang },
            components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 200) })) }] : [],
          },
        }),
      });
      if (!res.ok) {
        console.error('WhatsApp template send failed', res.status, (await res.text()).slice(0, 200));
        return false;
      }
      return true;
    },

    // Downloads a media file into memory. Never written to disk.
    async downloadMedia(mediaId) {
      const meta = await fetch(`${base}/${mediaId}`, { headers: auth });
      if (!meta.ok) throw new Error(`media meta ${meta.status}`);
      const { url, mime_type: mime } = await meta.json();
      const file = await fetch(url, { headers: auth });
      if (!file.ok) throw new Error(`media download ${file.status}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > 16 * 1024 * 1024) throw new Error('media too large'); // WhatsApp's own limit for audio; the engine applies smaller limits per kind
      return { buffer, mime };
    },
  };
}
