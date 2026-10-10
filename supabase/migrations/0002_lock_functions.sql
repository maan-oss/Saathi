-- Locks the atomic functions so only the service role can run them.
--
-- Status: PROPOSED, not applied to project edvtumklsjvcwipmqgfx. In the live project every function below can still
-- be run by anon and authenticated (has_function_privilege is true for both). Table access stops them today, because
-- the functions run as the caller and anon has no table rights. This migration removes the execute right as well, so
-- the public API cannot call them even if a table grant is added later.
--
-- The app calls these with the secret key (the service role), which keeps its execute right below.

revoke execute on function public.save_user(text, jsonb, integer, bigint, integer, text) from public, anon, authenticated;
revoke execute on function public.add_spend(date, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.spend_snapshot(date) from public, anon, authenticated;
revoke execute on function public.bump_user_day(date, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.bump_stat(date, text, text) from public, anon, authenticated;
revoke execute on function public.rate_hit(text, bigint, integer, bigint) from public, anon, authenticated;

grant execute on function public.save_user(text, jsonb, integer, bigint, integer, text) to service_role;
grant execute on function public.add_spend(date, numeric, numeric) to service_role;
grant execute on function public.spend_snapshot(date) to service_role;
grant execute on function public.bump_user_day(date, text, integer, integer) to service_role;
grant execute on function public.bump_stat(date, text, text) to service_role;
grant execute on function public.rate_hit(text, bigint, integer, bigint) to service_role;
