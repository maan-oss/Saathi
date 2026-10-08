// The setup console (served at /admin/setup?key=...). It shows what is connected, what is missing, and the exact
// values to paste into Meta and Stripe, each with a copy button. Same white-and-green look as the app.
// It cannot create your Meta, Stripe or Anthropic accounts: those need your own login, OTP and ID.

export const SETUP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saathi setup</title>
<style>
:root{--bg:#FAF9F5;--bg2:#F0EEE6;--ink:#1F1E1D;--mut:#5E5D59;--line:#DDD9CE;--green:#1F1E1D;--gi:#1F1E1D;--og:#FAF9F5;--tint:#ECEAE1;--warn:#8A5A00;--wbg:#FFF5E0;--bad:#B3261E;--bbg:#FDECEA;--serif:ui-serif,"Iowan Old Style","Palatino Linotype",Georgia,serif;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#262624;--bg2:#30302E;--ink:#F0EEE6;--mut:#A8A69D;--line:#41403C;--green:#F0EEE6;--gi:#F0EEE6;--og:#262624;--tint:#34332F;--warn:#E5B85C;--wbg:#2B2312;--bad:#F2938D;--bbg:#33191A;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
header b{font:600 21px var(--serif)}header span.hi{font:500 15px var(--serif);color:var(--gi)}.sp{flex:1}
main{max-width:760px;margin:0 auto;padding:22px 16px 60px;display:flex;flex-direction:column;gap:22px}
h1{font:600 30px/1.15 var(--serif);margin:0;letter-spacing:-.02em}h2{font:600 20px var(--serif);margin:0 0 4px}
p{margin:0}.mut{color:var(--mut)}.small{font-size:14px}
.card{border:1px solid var(--line);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.sum{display:inline-flex;align-items:center;gap:8px;font-weight:600;padding:8px 14px;border-radius:999px;align-self:flex-start}
.sum.good{background:var(--tint);color:var(--gi)}.sum.todo{background:var(--wbg);color:var(--warn)}
.st{display:flex;flex-direction:column}
.r{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);align-items:flex-start}.r:last-child{border:0}
.tag{flex:none;font:700 11px/1 ui-sans-serif,system-ui;letter-spacing:.04em;padding:5px 8px;border-radius:999px;margin-top:3px;min-width:44px;text-align:center}
.OK{background:var(--tint);color:var(--gi)}.FIX{background:var(--bbg);color:var(--bad)}.SKIP{background:var(--bg2);color:var(--mut)}
.r .t{font-weight:600}.r .d{color:var(--mut);font-size:14px}
.val{display:flex;gap:8px;align-items:center;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:8px 8px 8px 12px}
.val code{flex:1;min-width:0;overflow-wrap:anywhere;font:14px ui-monospace,Menlo,Consolas,monospace}
.val small{color:var(--mut);display:block;font:12px ui-sans-serif,system-ui}
button,a.btn{font:inherit;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:8px 14px;cursor:pointer;text-decoration:none;display:inline-block}
button.pri{background:var(--green);color:var(--og);border-color:var(--green);font-weight:600}
button.ok{background:var(--green);color:var(--og);border-color:var(--green)}
button:disabled{opacity:.5}
ol{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px}
input{font:inherit;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:9px 12px;min-width:0;flex:1}
.row{display:flex;gap:8px;flex-wrap:wrap}.msg{font-size:14px;min-height:20px}.msg.e{color:var(--bad)}.msg.g{color:var(--gi)}
pre{margin:0;white-space:pre-wrap;font:14px ui-monospace,Menlo,Consolas,monospace}
a{color:var(--gi)}
</style></head><body>
<header><svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="32" r="19" fill="currentColor"/><circle cx="40" cy="32" r="19" fill="currentColor"/><path d="M32 14.7a19 19 0 0 1 0 34.6 19 19 0 0 1 0-34.6z" fill="var(--bg)"/></svg>
<b>Saathi</b><span class="hi">साथी</span><span class="sp"></span><span class="mut small">Setup</span></header>
<main>
  <div><h1>Get Saathi live</h1><p class="mut" style="margin-top:6px">This page checks every connection and gives you the exact values to paste. Nothing here sends anything to real people, except the test message you choose.</p></div>

  <section class="card" id="statusCard">
    <div id="sum" class="sum todo">Checking…</div>
    <div class="st" id="rows"></div>
    <div class="row"><button class="pri" id="recheck">Check again</button><span class="mut small" id="when"></span></div>
  </section>

  <section class="card" id="aiCard">
    <h2>AI key (free models)</h2>
    <p class="mut small">Paste your OpenRouter key once. It is saved encrypted and works for everyone who uses Saathi, straight away. Get one free at openrouter.ai/keys.</p>
    <div class="row"><span class="sum todo" id="aiSum">Checking…</span></div>
    <div class="row"><input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…"><button class="pri" id="aiSave">Save key</button><button id="aiClear">Remove</button></div>
    <p class="msg" id="aiMsg"></p>
    <p class="mut small" id="aiNote"></p>
  </section>

  <section class="card">
    <h2>1. Connect WhatsApp</h2>
    <p class="mut small">In Meta for Developers, open your app, then WhatsApp, then Configuration.</p>
    <ol>
      <li>Under Webhook, press Edit and paste the two values below.</li>
      <li>Press Verify and save. It works only if your server is running at the address shown.</li>
      <li>Under Webhook fields, subscribe to <b>messages</b>.</li>
      <li>For a permanent token: Business settings, System users, create one, add your app, generate a token with <b>whatsapp_business_messaging</b> and <b>whatsapp_business_management</b>. The 24-hour token in the quick-start page stops working tomorrow.</li>
    </ol>
    <div class="val"><div style="flex:1;min-width:0"><small>Callback URL</small><code id="hook"></code></div><button data-copy="hook">Copy</button></div>
    <div class="val"><div style="flex:1;min-width:0"><small>Verify token</small><code id="vt"></code></div><button data-copy="vt">Copy</button></div>
    <p class="mut small" id="urlNote"></p>
  </section>

  <section class="card">
    <h2>2. Payments (optional)</h2>
    <p class="mut small">In Stripe: Developers, Webhooks, Add an endpoint. Paste the webhook URL below and choose the event <b>checkout.session.completed</b>. Stripe then shows a signing secret (whsec_...): put it in STRIPE_WEBHOOK_SECRET.</p>
    <div class="val"><div style="flex:1;min-width:0"><small>Stripe webhook URL</small><code id="stripeHook"></code></div><button data-copy="stripeHook">Copy</button></div>
  </section>

  <section class="card">
    <h2>3. Message templates</h2>
    <p class="mut small">WhatsApp only lets Saathi message first (reminders) with a template Meta has approved. Create it in WhatsApp Manager, Message templates. Approval usually takes minutes to a day.</p>
    <div id="tpls"></div>
  </section>

  <section class="card">
    <h2>4. Send yourself a test</h2>
    <p class="mut small">Sends Meta's built-in <b>hello_world</b> message. While your app is in development, the number must be added as a recipient in Meta's API setup page first.</p>
    <div class="row"><input id="to" inputmode="numeric" placeholder="919876543210 (country code, digits only)" aria-label="Phone number"><button class="pri" id="sendTest">Send test</button></div>
    <div class="msg" id="testMsg" role="status"></div>
  </section>

  <section class="card">
    <h2>5. Your links</h2>
    <div class="val"><div style="flex:1;min-width:0"><small>Web app (share this with people who don't use WhatsApp)</small><code id="app"></code></div><button data-copy="app">Copy</button></div>
    <div class="val"><div style="flex:1;min-width:0"><small>Privacy notice (paste into your WhatsApp business profile)</small><code id="priv"></code></div><button data-copy="priv">Copy</button></div>
    <div class="row"><a class="btn" id="inboxLink" href="#">Open the human inbox</a><a class="btn" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Meta for Developers</a><a class="btn" href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">Stripe</a><a class="btn" href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter</a></div>
  </section>

  <section class="card"><h2>Spend so far</h2><pre id="spend" class="mut"></pre></section>
</main>
<script>
const key = new URLSearchParams(location.search).get('key') || '';
const $ = (i) => document.getElementById(i);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => {
  const txt = $(b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(txt); } catch { const r = document.createRange(); r.selectNode($(b.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); }
  const o = b.textContent; b.textContent = 'Copied'; b.classList.add('ok'); setTimeout(() => { b.textContent = o; b.classList.remove('ok'); }, 1300);
});
$('inboxLink').href = '/admin/inbox?key=' + encodeURIComponent(key);
async function load() {
  $('recheck').disabled = true; $('sum').className = 'sum todo'; $('sum').textContent = 'Checking…';
  let j;
  try {
    const r = await fetch('/admin/setup/status', { headers: { 'x-admin-key': key } });
    if (!r.ok) throw new Error();
    j = await r.json();
  } catch { $('sum').textContent = 'Could not load. Check the key in the address.'; $('recheck').disabled = false; return; }
  const rows = $('rows'); rows.replaceChildren();
  for (const x of j.rows) {
    const s = x.s.trim() === 'OK' ? 'OK' : x.s.trim() === 'FIX' ? 'FIX' : 'SKIP';
    const r = el('div', 'r'); r.append(el('span', 'tag ' + s, s === 'SKIP' ? 'OFF' : s));
    const b = el('div'); b.append(el('div', 't', x.t)); if (x.d) b.append(el('div', 'd', x.d)); r.append(b); rows.append(r);
  }
  const fix = j.rows.filter((x) => x.s.trim() === 'FIX').length;
  $('sum').className = 'sum ' + (fix ? 'todo' : 'good');
  $('sum').textContent = fix ? fix + ' thing' + (fix > 1 ? 's' : '') + ' to fix' : 'All connected';
  $('when').textContent = 'Checked ' + new Date().toLocaleTimeString();
  $('hook').textContent = j.webhook; $('vt').textContent = j.verifyToken; $('stripeHook').textContent = j.stripeHook; $('app').textContent = j.app; $('priv').textContent = j.privacy;
  $('urlNote').textContent = j.publicUrlSet ? '' : 'PUBLIC_URL is not set, so these addresses are guessed from this page. Set PUBLIC_URL to your real https address, then check again.';
  const t = $('tpls'); t.replaceChildren();
  for (const x of j.templates) {
    const c = el('div', 'val'); const inner = el('div'); inner.style.cssText = 'flex:1;min-width:0';
    inner.append(el('small', '', 'Name: ' + x.name + ' · Language: English · Category: ' + x.category));
    const code = el('code', '', x.body); code.id = 'tpl-' + x.name; inner.append(code);
    const b = el('button', '', 'Copy text'); b.onclick = async () => { try { await navigator.clipboard.writeText(x.body); } catch {} b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy text'), 1300); };
    c.append(inner, b); t.append(c);
  }
  const s = j.stats; $('spend').textContent = 'Today: ₹' + s.todayInr + ' of ₹' + s.dailyBudgetInr + '   This month: ₹' + s.monthInr + ' of ₹' + s.monthlyBudgetInr + '   People today: ' + s.activeUsersToday;
  $('recheck').disabled = false;
}
$('recheck').onclick = load;
$('sendTest').onclick = async () => {
  const m = $('testMsg'); m.className = 'msg'; m.textContent = 'Sending…';
  const r = await fetch('/admin/setup/test-send', { method: 'POST', headers: { 'x-admin-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ to: $('to').value }) });
  const j = await r.json().catch(() => ({}));
  m.className = 'msg ' + (r.ok ? 'g' : 'e'); m.textContent = r.ok ? 'Sent. Check that phone.' : (j.error || 'Failed.');
};
async function aiLoad() {
  try {
    const j = await (await fetch('/admin/ai-key', { headers: { 'x-admin-key': key } })).json();
    $('aiSum').className = 'sum ' + (j.on ? 'good' : 'todo');
    $('aiSum').textContent = j.on ? 'AI is on · ' + j.model + (j.source === 'saved' ? ' · key saved here' : j.source === 'env' ? ' · key from server settings' : '') : 'AI is off · guide runs without free-form answers';
    $('aiNote').textContent = j.persistent ? '' : 'This host does not keep files between restarts, so a key saved here can be forgotten after a restart. Add it as OPENROUTER_API_KEY in your host settings to make it permanent.';
  } catch { $('aiSum').textContent = 'Could not load'; }
}
$('aiSave').onclick = async () => {
  const m = $('aiMsg'); m.className = 'msg'; m.textContent = 'Checking the key with OpenRouter…'; $('aiSave').disabled = true;
  const r = await fetch('/admin/ai-key', { method: 'POST', headers: { 'x-admin-key': key, 'content-type': 'application/json', 'x-saathi': '1' }, body: JSON.stringify({ key: $('aiKey').value }) });
  const j = await r.json().catch(() => ({}));
  $('aiSave').disabled = false;
  m.className = 'msg ' + (r.ok ? 'g' : 'e'); m.textContent = r.ok ? 'Saved. It works for everyone now.' : (j.error || 'Failed.');
  if (r.ok) $('aiKey').value = '';
  aiLoad();
};
$('aiClear').onclick = async () => {
  const r = await fetch('/admin/ai-key', { method: 'POST', headers: { 'x-admin-key': key, 'content-type': 'application/json', 'x-saathi': '1' }, body: JSON.stringify({ key: '' }) });
  $('aiMsg').className = 'msg g'; $('aiMsg').textContent = r.ok ? 'Removed.' : 'Failed.'; aiLoad();
};
aiLoad();
load();
</script></body></html>`;
