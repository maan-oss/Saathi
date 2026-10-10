# Moving Saathi's data to Supabase (cutover runbook)

Status: **not started.** The schema, the import, and the safety fixes are in place. The switch itself is blocked on the
gates below.

## Gates: all four must be closed before the switch

1. **Backups.** The Supabase organization (Moventra) is on the **free plan**. Free projects have no daily backups and no
   point-in-time recovery. `src/supastore.js` assumes Supabase keeps the backups, so today nothing would. Pick one:
   - upgrade the organization to a paid plan (daily backups), or
   - run a scheduled export of the database to somewhere outside Supabase, and test one restore.
   Do not switch over until one of these is live and a restore has been tried.
2. **Region.** The Supabase project is in `ap-south-1` (Mumbai). `render.yaml` does not set a region, so the Render
   service is in whatever region was picked when it was created. Check it in Render. A region cannot be changed on an
   existing service: moving to a closer one (Singapore is the nearest Render region to Mumbai) means a new service and a
   new disk, then the same copy as below.
3. **Secret key.** Create the secret key in Supabase (Project Settings, API Keys). Put it in Render as
   `SUPABASE_SECRET_KEY`. Never paste it into chat, a file, or the repo.
4. **A real API test.** The schema was checked on a local Postgres 16, and the SQL functions were checked on the live
   project. The app's Supabase client (PostgREST requests) has **not** been run against a real Supabase API yet. Run the
   app against a staging project or a Supabase branch first, and send one WhatsApp message, one web visit, one payment
   test, and one reminder through it.

## The switch (app stopped)

1. Suspend the Render service, so nothing writes to the disk while it is copied.
2. Copy the disk's top-level data files (`users.json`, `ledger.json`, `payments.json`, `trials.json`,
   `translations.json`, `settings.json`, `referrals.json`, `handoff.json`, `stats.json`) to a safe folder. The
   `backups/` folder is not needed for the import.
3. Dry run, from the repo:
   `node scripts/import-to-supabase.js --from <copied folder>`
   It prints the row counts. Check them against the file sizes and the admin page.
4. Import, with the key in the environment (not typed into a file):
   `SUPABASE_URL=https://edvtumklsjvcwipmqgfx.supabase.co SUPABASE_SECRET_KEY=... node scripts/import-to-supabase.js --from <copied folder> --apply`
   The script refuses to write into a project that already has people or payments. `--overwrite` is only for a
   deliberate decision that the files are the truth.
5. Run step 4 once more. The counts must not change.
6. In Render, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, then resume the service.
7. Open `/admin/setup?key=...`. The storage line must say Supabase, and "Data on its own disk" must say OK.
8. Smoke test the four paths listed in gate 4, on the live service.
9. Keep the copied folder for at least 14 days.

## Rollback

Remove `SUPABASE_URL` in Render and redeploy. The app goes back to the files on the disk.

Anything written to Supabase after step 6 is **not** in those files. A clean rollback is only possible in the first few
minutes. After that, the Supabase rows have to be exported and merged by hand. Decide the window before starting.

## What has already been checked

- Schema: `supabase/migrations/0001_saathi_data_layer.sql` reproduces the live tables, indexes, row security, and
  functions. Re-running it changes nothing.
- Lockdown: `supabase/migrations/0002_lock_functions.sql` is applied to the live project. The service role can call
  the functions; anon is refused.
- Import: `scripts/import-to-supabase.js` has tests for the mapping, the counts, the refusal on a busy project, and the
  request shapes. A dry run on the development data works.
- Safety fixes: link codes are single-use, reminder and payment saves retry on a conflict, and the full test suite
  passes (261 of 261).
- Advisors: the security advisor reports only informational notes (row security on, no policies, which is intended
  because only the secret key touches the data).
