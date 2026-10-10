# Moving Saathi's data to Supabase (cutover runbook)

Status: **not started.** The schema, the import, and the safety fixes are in place. The switch itself is blocked on the
gates below.

Target project: `saathi-us-west`, ref `cbrqkkufeywrumldloud`, region `us-west-1` (North California). It was created on
2026-10-10, migrations 0001 and 0002 are applied, and it holds no rows yet. The Mumbai project `saathi`
(`edvtumklsjvcwipmqgfx`) is paused, and it was empty when paused. `oskra` was not changed.

## Gates: all four must be closed before the switch

1. **Backups: accepted without.** The Supabase organization (Moventra) is on the free plan, which has no daily backups
   and no point-in-time recovery. The owner has decided this is acceptable (2026-10-10). Keep the dated file copies
   from the switch for at least 14 days, as step 9 says.
2. **Region: closed, by owner decision (2026-10-10).** The Render service `saathi` (`srv-db3lf0rncjis73at6jj0`) is in
   Oregon. Render has no Mumbai region (its list is Oregon, Ohio, Virginia, Frankfurt and Singapore). The Supabase
   project is now `us-west-1` (North California), the closest US West region the Supabase tool offers. Its
   `us-west-2` (Oregon) option was rejected by that tool, and the dashboard was not used for it. Render and Supabase
   are therefore both in US West.
3. **Secret key: not yet created.** Create the secret key for `cbrqkkufeywrumldloud` in Supabase (Project Settings, API
   Keys). Put it in Render as `SUPABASE_SECRET_KEY`. Never paste it into chat, a file, or the repo.
4. **A real API test: not done, but the staging gap is closed.** The new project is empty and not serving any data,
   so it can be the test target before the import. Once the secret key exists, run `scripts/smoke-supabase.js` with
   `SUPABASE_URL=https://cbrqkkufeywrumldloud.supabase.co` and the key in the environment. The script refuses the old
   Mumbai ref, not the new one. After the import, add `cbrqkkufeywrumldloud` to its `PROD_REF` guard, so it can
   never run against live data. The schema was checked on local Postgres 16, and the public API is refused for anon
   on the old project (401, `42501`).

## The switch (app stopped)

1. Suspend the Render service, so nothing writes to the disk while it is copied.
2. Copy the disk's top-level data files (`users.json`, `ledger.json`, `payments.json`, `trials.json`,
   `translations.json`, `settings.json`, `referrals.json`, `handoff.json`, `stats.json`) to a safe folder. The
   `backups/` folder is not needed for the import.
3. Dry run, from the repo:
   `node scripts/import-to-supabase.js --from <copied folder>`
   It prints the row counts. Check them against the file sizes and the admin page.
4. Import, with the key in the environment (not typed into a file):
   `SUPABASE_URL=https://cbrqkkufeywrumldloud.supabase.co SUPABASE_SECRET_KEY=... node scripts/import-to-supabase.js --from <copied folder> --apply`
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
- New project `cbrqkkufeywrumldloud` (us-west-1): migrations 0001 and 0002 applied. 13 tables and 6 functions exist.
  `anon` cannot run `save_user`, and `service_role` can. The users table is empty.
