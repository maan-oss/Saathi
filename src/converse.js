// One turn of conversation, shared by every channel (WhatsApp and the web app).
// `key` is how a channel names a person for the operator inbox: a phone number on WhatsApp, "web:<id>" on the web.
// It handles the human handoff rules; the bot itself (flow.js) never knows which channel it is talking on.
import { redact } from './scamcheck.js';

export function createConverse({ store, bot }) {
  return async function converse({ key, userId, input, ctx = {} }) {
    const open = store.activeHandoff(key);
    if (open) {
      // The person asked for a human. Keep what they write for the operator, and stay quiet while the human is on it.
      const said = input.type === 'text' ? input.text : input.type === 'reply' ? input.title || input.id : `[${input.type}]`;
      const backToBot = input.type === 'text' && ['menu', '0', 'restart'].includes(String(input.text).trim().toLowerCase());
      store.updateHandoff(open.id, (h) => {
        h.thread.push({ ts: Date.now(), dir: 'in', text: redact(String(said)).slice(0, 1000) });
        h.unread = true;
        if (backToBot && h.status === 'replied') h.status = 'open';
      });
      if (open.status === 'replied' && !backToBot && Date.now() - (open.repliedAt || 0) < 12 * 3600 * 1000) return { replies: [], quiet: true };
    }
    const { replies, handoff } = await bot.handle(userId, input, ctx);
    if (handoff && !store.activeHandoff(key)) {
      // Only when the user explicitly asked for a human. One of the places a contact is stored.
      store.appendHandoff({ ts: Date.now(), phone: key, channel: key.startsWith('web:') ? 'web' : 'whatsapp', ...handoff, thread: [{ ts: Date.now(), dir: 'sys', text: 'asked for a human' }], unread: true });
    }
    return { replies };
  };
}
