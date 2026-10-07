# Turn the WhatsApp bot on (and keep it in sync with the web app)

Sync works because web and WhatsApp are the same engine reading the same store. They only
disagree if they run on different servers/disks. So: **run ONE server that has a disk**
(Fly.io, Render, Railway, any VPS). Vercel is fine for the marketing site and demo, but it has no
persistent disk, so do not use it as the WhatsApp host.

1. Deploy: `fly launch` (uses fly.toml + Dockerfile) or Render (render.yaml). Attach a 1 GB volume at `/data`, set `DATA_DIR=/data`.
2. Env vars: `VAULT_KEY`, `HASH_SALT` (long random, never change later), `ADMIN_KEY`,
   `WHATSAPP_TOKEN` (permanent System User token), `WHATSAPP_PHONE_ID`, `VERIFY_TOKEN` (any string you pick),
   `APP_SECRET` (Meta app secret, makes webhook signatures verified), optional `OPENROUTER_API_KEY`.
3. Meta developer console > your app > WhatsApp > Configuration: callback URL `https://YOUR-HOST/webhook`,
   verify token = `VERIFY_TOKEN`, subscribe to `messages`.
4. Message the test number from your phone. Replies should arrive. `/admin/stats?key=ADMIN_KEY` shows traffic.
5. Link to the web app: open the web app > Settings > Linked devices > Link WhatsApp, send the 8-character code
   to the bot, answer Yes. From then on chats' saved details, locker, reminders, wallet and packs are one account.
6. Add the approved reminder template named `saathi_reminder` (for reminders after 24 hours).
