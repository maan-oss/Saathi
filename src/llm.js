// Thin wrapper over the Anthropic Messages API (plain fetch, no SDK).
// Used for three things only: answering free-form questions, reading documents (photo or PDF), and translating
// the bot's own texts into another language (once per language, then cached).

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

export function createLlm(config) {
  // OpenRouter wins when its key is set: it can route to free models. Otherwise Anthropic.
  // Read live, so a key pasted into the admin page works at once without a restart.
  const isOpenRouter = () => Boolean(config.openrouterKey);
  const isEnabled = () => isOpenRouter() || Boolean(config.anthropicKey);

  // Our content blocks are Anthropic-shaped; OpenRouter wants OpenAI-shaped ones.
  const toOpenAi = (content) =>
    typeof content === 'string'
      ? content
      : content.map((b) => {
          if (b.type === 'text') return b;
          if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
          if (b.type === 'document') return { type: 'file', file: { filename: 'document.pdf', file_data: `data:${b.source.media_type};base64,${b.source.data}` } };
          return b;
        });

  async function callOpenRouter({ system, content, maxTokens }, attempt = 0) {
    const res = await fetch(`${config.openrouterBase || 'https://openrouter.ai'}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openrouterKey}`,
        'http-referer': config.publicUrl || 'https://saathi.app',
        'x-title': 'Saathi',
      },
      body: JSON.stringify({
        model: config.openrouterModel || 'stealth/space-bunny-alpha',
        // If the first model is busy or has been retired, OpenRouter moves to the next one by itself.
        ...(config.openrouterFallbacks?.length ? { models: [config.openrouterModel || 'stealth/space-bunny-alpha', ...config.openrouterFallbacks] } : {}),
        reasoning: { effort: 'low', exclude: true }, // short answers: do not spend the reply budget on hidden thinking
        max_tokens: maxTokens + 300,
        messages: [{ role: 'system', content: system }, { role: 'user', content: toOpenAi(content) }],
      }),
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
    return { text, usage: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 } };
  }

  async function call({ system, content, maxTokens }) {
    if (isOpenRouter()) return callOpenRouter({ system, content, maxTokens });
    const res = await fetch(`${config.anthropicBase || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return { text, usage: { in: data.usage?.input_tokens || 0, out: data.usage?.output_tokens || 0 } };
  }

  return {
    get enabled() { return isEnabled(); },
    get provider() { return isOpenRouter() ? 'openrouter' : 'anthropic'; },
    /** Swap the OpenRouter key while running. Empty string removes it. Free models cost nothing, so the spend counter is zeroed. */
    setKey(key) {
      config.openrouterKey = String(key || '').trim();
      if (config.openrouterKey) { config.llmInUsdPerM = 0; config.llmOutUsdPerM = 0; }
    },

    async answer(system, question, opts = {}) {
      const r = await call({ system, content: question, maxTokens: opts.max || 350 });
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
