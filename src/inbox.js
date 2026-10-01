// The operator inbox page (served at /admin/inbox?key=...). One small self-contained page, no dependencies.
// It lists people who asked for a human, shows what they wrote, and lets an operator reply.
// WhatsApp only allows free-form replies within 24 hours of the person's last message: the page says so and disables
// the box for older conversations.

export const INBOX_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saathi inbox</title>
<style>
:root{--bg:#FAF9F5;--ink:#1F1E1D;--mut:#5E5D59;--card:#F0EEE6;--line:#DDD9CE;--green:#1F1E1D;--cream:#ECEAE1;--warn:#8A5A00;--og:#FAF9F5;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#262624;--ink:#F0EEE6;--mut:#A8A69D;--card:#30302E;--line:#41403C;--green:#F0EEE6;--cream:#34332F;--warn:#E5B85C;--og:#262624;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
header{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
h1{font:600 21px ui-serif,'Iowan Old Style',Georgia,serif;margin:0}.sp{flex:1}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 12px;cursor:pointer}
button.pri{background:var(--green);color:var(--og);border-color:var(--green);font-weight:600}button:disabled{opacity:.5;cursor:default}
main{max-width:760px;margin:0 auto;padding:12px 16px 40px}
.h{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:12px 0;padding:12px 14px}
.top{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.ph{font-weight:600}.tag{font-size:12px;color:var(--mut)}
.tag.unread{color:var(--warn);font-weight:600}.th{margin:10px 0;display:flex;flex-direction:column;gap:6px}
.m{max-width:85%;padding:7px 10px;border-radius:10px;white-space:pre-wrap;word-break:break-word}
.in{background:var(--cream);align-self:flex-start}.out{background:var(--green);color:var(--og);align-self:flex-end}
.sys{color:var(--mut);font-size:12px;align-self:center}
form{display:flex;gap:8px}textarea{flex:1;font:inherit;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg);color:var(--ink);min-height:44px}
.note{color:var(--warn);font-size:13px;margin:6px 0}.empty{color:var(--mut);text-align:center;padding:40px 0}
</style></head><body>
<header><svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="32" r="19" fill="currentColor"/><circle cx="40" cy="32" r="19" fill="currentColor"/><path d="M32 14.7a19 19 0 0 1 0 34.6 19 19 0 0 1 0-34.6z" fill="var(--bg)"/></svg><h1>Saathi inbox</h1><span class="tag" id="cnt"></span><span class="sp"></span>
<label class="tag"><input type="checkbox" id="showClosed"> show closed</label><button id="refresh">Refresh</button></header>
<main id="list"><div class="empty">Loading...</div></main>
<script>
const key = new URLSearchParams(location.search).get('key') || '';
const hdr = { 'x-admin-key': key, 'content-type': 'application/json' };
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
const when = (ts) => new Date(ts).toLocaleString();
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: hdr, body: JSON.stringify(body) } : { headers: hdr });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
async function load() {
  const { ok, j } = await api('/admin/handoffs');
  const box = document.getElementById('list');
  box.replaceChildren();
  if (!ok) { box.append(el('div', 'empty', 'Could not load. Check the key in the address.')); return; }
  const showClosed = document.getElementById('showClosed').checked;
  const rows = j.filter((h) => showClosed || h.status !== 'closed');
  document.getElementById('cnt').textContent = rows.filter((h) => h.unread).length + ' unread';
  if (!rows.length) { box.append(el('div', 'empty', 'Nobody is waiting for a human.')); return; }
  for (const h of rows) {
    const card = el('div', 'h');
    const top = el('div', 'top');
    top.append(el('span', 'ph', h.phone), el('span', 'tag', h.status), el('span', 'tag', [h.svc, h.route && 'route ' + h.route, h.step != null && 'step ' + (h.step + 1), h.lang].filter(Boolean).join(' · ')), el('span', 'tag', when(h.ts)));
    if (h.unread) top.append(el('span', 'tag unread', 'new message'));
    card.append(top);
    const th = el('div', 'th');
    for (const m of h.thread || []) th.append(el('div', 'm ' + m.dir, m.text));
    card.append(th);
    if (h.status !== 'closed') {
      if (!h.canReply) card.append(el('div', 'note', 'More than 24 hours since they last wrote. WhatsApp only allows an approved template message now, so you cannot reply here.'));
      if (h.channel === 'web') card.append(el('div', 'tag', 'Web app user: your reply appears in their app within a few seconds, if they have it open. Otherwise they see it when they return.'));
      const f = el('form');
      const ta = el('textarea'); ta.placeholder = 'Reply...'; ta.maxLength = 1000; ta.disabled = !h.canReply;
      const send = el('button', 'pri', 'Send'); send.disabled = !h.canReply; send.type = 'submit';
      const close = el('button', '', 'Close'); close.type = 'button';
      f.append(ta, send, close);
      f.onsubmit = async (e) => {
        e.preventDefault(); if (!ta.value.trim()) return;
        send.disabled = true;
        const r = await api('/admin/reply', { id: h.id, text: ta.value });
        if (!r.ok) { alert(r.j.hint || 'Could not send: ' + (r.j.error || r.status)); send.disabled = false; return; }
        load();
      };
      close.onclick = async () => { await api('/admin/close', { id: h.id }); load(); };
      card.append(f);
    }
    box.append(card);
  }
}
document.getElementById('refresh').onclick = load;
document.getElementById('showClosed').onchange = load;
load(); setInterval(load, 30000);
</script></body></html>`;
