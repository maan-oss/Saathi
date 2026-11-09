// Thin wrapper over OpenRouter's chat API (plain fetch, no SDK). One provider, one key.
// Used for three things only: answering free-form questions, reading documents (photo or PDF), and translating
// the bot's own texts into another language (once per language, then cached). Free models cost nothing to run.
import { createHash } from 'node:crypto';

/** Free models love Markdown. Chat here only understands *bold*, _italic_ and "• " bullets, so turn the rest into those. */
export function tidyAnswer(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/^\s{0,3}#{1,6}\s*(.+)$/gm, '*$1*')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '_$1_')
    .replace(/`+([^`\n]+)`+/g, '$1')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/^[ \t]*(\d+)\)[ \t]+/gm, '$1. ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// A free model that hangs must not hang the chat: give up after this long and let the bot say "try again soon".
const TIMEOUT_MS = 25_000;
// Answers to the same question (same system prompt, same wording) are kept for an hour, in memory only, so a common
// question is answered instantly and costs nothing. Only the hash of the question is used as the key.
const CACHE_MAX = 300;
const CACHE_TTL_MS = 60 * 60 * 1000;

export function createLlm(config) {
  // Read live, so a key pasted into the admin page works at once without a restart.
  const isEnabled = () => Boolean(config.openrouterKey);

  // Our content blocks are Anthropic-shaped in the calling code; OpenRouter wants OpenAI-shaped ones.
  const toOpenAi = (content) =>
    typeof content === 'string'
      ? content
      : content.map((b) => {
          if (b.type === 'text') return b;
          if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
          if (b.type === 'document') return { type: 'file', file: { filename: 'document.pdf', file_data: `data:${b.source.media_type};base64,${b.source.data}` } };
          return b;
        });

  const cache = new Map(); // key -> { at, value }
  const cacheKey = (system, question, max) =>
    createHash('sha256').update(`${max}\n${system}\n${typeof question === 'string' ? question : JSON.stringify(question)}`).digest('hex');
  function recall(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    cache.delete(key);
    if (Date.now() - hit.at > CACHE_TTL_MS) return null;
    cache.set(key, hit); // most recently used goes last, so the oldest is the first to go
    return hit.value;
  }
  function remember(key, value) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
  }

  async function callOpenRouter({ system, content, maxTokens }, attempt = 0) {
    const model = config.openrouterModel || 'google/gemma-4-31b-it:free';
    const res = await fetch(`${config.openrouterBase || 'https://openrouter.ai'}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openrouterKey}`,
        'http-referer': config.publicUrl || 'https://saathi.app',
        'x-title': 'Saathi',
      },
      body: JSON.stringify({
        model,
        // If the first model is busy or has been retired, OpenRouter moves to the next one by itself.
        ...(config.openrouterFallbacks?.length ? { models: [model, ...config.openrouterFallbacks] } : {}),
        reasoning: { effort: 'low', exclude: true }, // short answers: do not spend the reply budget on hidden thinking
        max_tokens: maxTokens + 300,
        messages: [{ role: 'system', content: system }, { role: 'user', content: toOpenAi(content) }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Free models are shared and get busy. One patient retry, then let the bot say "try again soon".
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      await new Promise((r) => setTimeout(r, 1500));
      return callOpenRouter({ system, content, maxTokens }, attempt + 1);
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    let text = String(data.choices?.[0]?.message?.content || '');
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Free models sometimes return nothing at all (the budget went to hidden thinking). Try once more, with a little
    // more room, before the person sees "I can't answer that right now".
    if (!text && attempt < 1) return callOpenRouter({ system, content, maxTokens: maxTokens + 200 }, attempt + 1);
    return { text, usage: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 } };
  }

  async function call(args) {
    if (!isEnabled()) throw new Error('AI is off: no OPENROUTER_API_KEY');
    return callOpenRouter(args);
  }

  return {
    get enabled() { return isEnabled(); },
    get provider() { return isEnabled() ? 'openrouter' : null; },
    /** Swap the OpenRouter key while running. Empty string removes it. Free models cost nothing, so the spend counter is zeroed. */
    setKey(key) {
      config.openrouterKey = String(key || '').trim();
      if (config.openrouterKey) { config.llmInUsdPerM = 0; config.llmOutUsdPerM = 0; }
      cache.clear();
    },

    /** opts.max: reply budget in tokens. opts.fresh: skip the cache (used by the admin "test the key" button). */
    async answer(system, question, opts = {}) {
      const max = opts.max || 350;
      const key = cacheKey(system, question, max);
      if (!opts.fresh) {
        const hit = recall(key);
        if (hit) return { ...hit, usage: { in: 0, out: 0 }, cached: true };
      }
      const r = await call({ system, content: question, maxTokens: max });
      const out = { ...r, text: tidyAnswer(r.text) };
      if (out.text) remember(key, out); // an empty reply is never cached, so the next try asks again
      return out;
    },

    /**
     * Looks at one photo and answers the person's question about it. Never cached: every photo is private.
     */
    async answerImage(buffer, mime, question, system) {
      const r = await call({
        system,
        maxTokens: 500,
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: buffer.toString('base64') } },
          { type: 'text', text: question },
        ],
      });
      return { ...r, text: tidyAnswer(r.text) };
    },

    /**
     * Translates a batch of texts. items = [{ k, en, max? }]. Returns { map: {k: text}, usage }.
     * The caller validates every result (placeholders, bold markers, length) before trusting it.
     */
    async translate(langName, items) {
      const system =
        `You translate the texts of a WhatsApp bot that helps people in India with government paperwork into ${langName}. ` +
        'Use simple, everyday, respectful words that a first-time smartphone user understands. ' +
        'Rules: keep every {placeholder} exactly as written, in the text. Keep *bold* markers around the same words. ' +
        'Keep website names, form names (like Form 6, Form 1A), acronyms (PAN, OTP, GST, ITR, RTO, PSK) and numbers, rupee amounts and dates exactly as they are. ' +
        'Keep line breaks and bullet characters. Respect each "max" (a maximum length in characters) when given: shorten the wording, never cut mid-word. ' +
        'Do not add or remove information. ' +
        'Reply with ONE JSON object only, no other text, mapping each key k to its translation.';
      const { text, usage } = await call({ system, maxTokens: 7000, content: JSON.stringify(items.map(({ k, en, max }) => (max ? { k, en, max } : { k, en }))) });
      const m = text.match(/\{[\s\S]*\}/);
      let map = {};
      try {
        map = JSON.parse(m ? m[0] : '{}');
      } catch {
        /* the caller treats missing keys as failures */
      }
      return { map, usage };
    },

    // Reads a document photo or PDF. Returns { type, readable, issues[], fields, name, dob, usage }.
    // fields = { name, dob (DD/MM/YYYY), father_name, gender, address, pincode }, each null when not printed.
    // Never returns ID, card, or account numbers.
    async checkDocument(buffer, mime) {
      const system =
        'You read photos and PDFs that people send while doing Indian government paperwork (PAN, licence, Aadhaar, passport and similar). ' +
        'Reply with ONE JSON object only, no other text: ' +
        '{"type":"aadhaar|voter_id|passport|driving_licence|birth_certificate|school_certificate|photo|signature|other|not_a_document",' +
        '"readable":true|false,"issues":["short problems like blurry, glare, cropped corners, too dark"],' +
        '"fields":{"name":"full name as printed or null","dob":"DD/MM/YYYY or null","father_name":"father or guardian name if printed or null",' +
        '"gender":"male|female|other|null","address":"full address on one line or null","pincode":"6 digits or null",' +
        '"number":"the main ID number printed on it (PAN, Aadhaar, licence, passport, voter ID or GSTIN), exactly as printed, or null",' +
        '"expiry":"expiry or valid-until date as DD/MM/YYYY, or null"}}. ' +
        'Only copy what is clearly printed. Use null for anything missing or unclear. ' +
        'Copy the ID number character by character; if any character is unclear use null rather than guessing. NEVER output a bank card number, CVV, account number or OTP.';
      const { text, usage } = await call({
        system,
        maxTokens: 450,
        content: [
          mime === 'application/pdf'
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
            : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: buffer.toString('base64') } },
          { type: 'text', text: 'Read this document.' },
        ],
      });
      const m = text.match(/\{[\s\S]*\}/);
      let parsed = {};
      try {
        parsed = JSON.parse(m ? m[0] : '{}');
      } catch {
        /* fall through with empty result */
      }
      const f = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
      return {
        type: parsed.type || 'other',
        readable: parsed.readable === true,
        issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 3).map(String) : [],
        fields: f,
        name: f.name || null,
        dob: f.dob || null,
        number: f.number || null,
        expiry: f.expiry || null,
        usage,
      };
    },
  };
}
