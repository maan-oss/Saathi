// Rich reply builders. The engine returns either a plain string or one of these objects.
// Every rich object can be flattened to numbered plain text with plain(), so terminals and
// text-only channels still work.

export const R = {
  // Up to 3 quick-reply buttons. Titles must be 20 characters or less on WhatsApp.
  buttons: (body, buttons) => ({ kind: 'buttons', body, buttons }),
  // A menu that opens as a list. Max 10 rows. Row title 24 chars, description 72.
  list: (body, button, rows) => ({ kind: 'list', body, button, rows }),
  // A form. On WhatsApp this is a Flow; without a Flow it is asked one field at a time.
  form: (id, body, cta, fields, values) => ({ kind: 'form', id, body, cta, fields, values }),
  // A finished sheet of copy-ready values.
  sheet: (title, rows, missing, text) => ({ kind: 'sheet', title, rows, missing, text }),
  // An unlocked locker card. `items` are [{label, value, copy}] pairs. The web app hides it again after `ttl` seconds.
  // Everything one service needs in a single card. Private field values are NOT included; the web app fetches them on Show.
  pack: (title, data, text) => ({ kind: 'pack', title, ...data, body: text }),
  secret: (title, items, text, ttl = 30) => ({ kind: 'secret', title, items, body: text, ttl }),
};

export function plain(r) {
  if (typeof r === 'string') return r;
  if (r.kind === 'buttons') return `${r.body}\n${r.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')}`;
  if (r.kind === 'list') return `${r.body}\n${r.rows.map((x, i) => `${i + 1}. ${x.title}`).join('\n')}`;
  if (r.kind === 'form') return r.body;
  if (r.kind === 'sheet') return r.text;
  if (r.kind === 'secret') return r.body;
  if (r.kind === 'pack') return r.body;
  return String(r.body || '');
}

