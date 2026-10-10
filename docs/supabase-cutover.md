# Moving Saathi's data to Supabase (cutover runbook)

Status: **not started.** The schema, the import, and the safety fixes are in place. The switch itself is blocked on the
gates below.

## Gates: all four must be closed before the switch

1. **Backups: accepted without.** The Supabase organization (Moventra) is on the free plan, which has no daily backups
   and no point-in-time recovery. The owner has decided this is acceptable (2026-10-10). Keep the dated file copies
   from the switch for at least 14 days, as step 9 says.
2. **Region: not confirmed.** The Supabase project is in `ap-south-1` (Mumbai). `render.yaml` does not set a region, and
   this session cannot see the Render service. Its public address is `https://saathi-u4o7.onrender.com`, and `/health`
   returns `ok`, but the response does not show the region. Check it in Render (service, Settings, Region). A region
   cannot be changed on an existing service: moving to Singapore, the nearest Render region to Mumbai, means a new
   service and a new disk, then the same copy as below.
3. **Secret key: not yet created.** Create the secret key in Supabase (Project Settings, API Keys). Put it in Render as
   `SUPABASE_SECRET_KEY`. Never paste it into chat, a file, or the repo.
4. **A real API test: not done.** The schema was checked on a local Postgres 16, and the functions were checked on the
   live project. The public API was checked live: anon is refused on every table and on the functions (401, `42501`).
   The write path has not been run through the real REST API, because there is no staging project yet. The project
   limit on the free plan is full (two active projects: `saathi` and `oskra`), and creating a branch was cancelled.
   Once a staging project exists, run `scripts/smoke-supabase.js` against it with its secret key. It refuses the
   production project and checks every store method through the REST API.

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
