-- Saathi data layer, schema version 1.
--
-- This file reproduces what project edvtumklsjvcwipmqgfx already runs (the live migration is recorded as
-- saathi_data_layer_tables). Run it on an empty project to build the same schema. Every statement is written so
-- that re-running it on the live project changes nothing: tables and indexes use IF NOT EXISTS and functions use
-- CREATE OR REPLACE.
--
-- Access model: the app talks to Supabase with its secret key (the service role). That role bypasses row level
-- security. RLS is on for every table with no policies, and anon and authenticated get no table privileges, so the
-- public API cannot read or write any of this. See 0002_lock_functions.sql for the function side.

-- ---- tables ---------------------------------------------------------------------------------------------------

-- Small app settings (key -> any JSON value).
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

-- One record per person. doc is the whole account record; the other columns are copies kept for queries and the
-- compare-and-set write (see save_user). version goes up on every save; updated_ms is the last real activity.
create table if not exists public.users (
  id           text primary key,
  doc          jsonb    not null default '{}'::jsonb,
  version      integer  not null default 1,
  updated_ms   bigint   not null default 0,
  wallet_paise integer  not null default 0,
  link_to      text,
  has_reminders boolean generated always as (
    case
      when jsonb_typeof(doc -> 'reminders') = 'array' then jsonb_array_length(doc -> 'reminders') > 0
      else false
    end
  ) stored
);
create index if not exists users_updated_idx on public.users (updated_ms);
create index if not exists users_link_idx on public.users (link_to) where link_to is not null;
create index if not exists users_wallet_idx on public.users (wallet_paise) where wallet_paise > 0;
create index if not exists users_reminders_idx on public.users (id) where has_reminders;

-- One short referral code per person. A code is unique, and so is the person it belongs to.
create table if not exists public.referral_codes (
  code    text primary key,
  user_id text not null unique
);

-- The one-time welcome credit has been given to this person (kept so delete-and-return cannot claim it twice).
create table if not exists public.trials (
  user_id    text primary key,
  created_ms bigint not null
);

-- Payment records, kept for accounts and tax.
create table if not exists public.payments (
  ref   text primary key,
  doc   jsonb  not null,
  ts_ms bigint not null default 0
);
create index if not exists payments_ts_idx on public.payments (ts_ms);

-- Machine translations of the bot's texts, one record per language.
create table if not exists public.translations (
  code text primary key,
  doc  jsonb not null
);

-- Spend per UTC day (LLM and messaging, in rupees).
create table if not exists public.spend_daily (
  day     date primary key,
  llm_inr numeric not null default 0,
  msg_inr numeric not null default 0
);

-- Per-person daily counters, used for the free-allowance checks.
create table if not exists public.user_daily (
  day     date    not null,
  user_id text    not null,
  llm     integer not null default 0,
  inbound integer not null default 0,
  primary key (day, user_id)
);

-- Daily event totals for the funnel. source is '' for the overall total.
create table if not exists public.stats_daily (
  day    date   not null,
  event  text   not null,
  source text   not null default '',
  n      bigint not null default 0,
  primary key (day, event, source)
);

-- WhatsApp message ids already handled (webhooks are retried).
create table if not exists public.seen_messages (
  id    text primary key,
  ts_ms bigint not null
);
create index if not exists seen_messages_ts_idx on public.seen_messages (ts_ms);

-- Fixed-window rate limits. One row per key; it resets when the window moves on.
create table if not exists public.rate_hits (
  k            text primary key,
  window_start bigint  not null,
  n            integer not null default 0
);

-- Short-lived values shared by every instance (WhatsApp link pending states and similar).
create table if not exists public.kv (
  k          text primary key,
  v          jsonb  not null,
  expires_ms bigint not null
);
create index if not exists kv_expires_idx on public.kv (expires_ms);

-- People who asked for a human. The phone number and thread are kept only for that.
create table if not exists public.handoffs (
  id        text primary key,
  phone     text   not null,
  status    text   not null,
  ts_ms     bigint not null,
  closed_ms bigint,
  doc       jsonb  not null
);
create index if not exists handoffs_open_idx on public.handoffs (phone, ts_ms desc) where status <> 'closed';
create index if not exists handoffs_closed_idx on public.handoffs (closed_ms) where status = 'closed';

-- ---- row level security and grants ----------------------------------------------------------------------------

alter table public.settings       enable row level security;
alter table public.users          enable row level security;
alter table public.referral_codes enable row level security;
alter table public.trials         enable row level security;
alter table public.payments       enable row level security;
alter table public.translations   enable row level security;
alter table public.spend_daily    enable row level security;
alter table public.user_daily     enable row level security;
alter table public.stats_daily    enable row level security;
alter table public.seen_messages  enable row level security;
alter table public.rate_hits      enable row level security;
alter table public.kv             enable row level security;
alter table public.handoffs       enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- ---- atomic operations ------------------------------------------------------------------------------------------

-- Saves a person's record only if nobody changed it since it was read (compare-and-set).
-- p_expected = 0 means "new record". Returns the new version, or null when the save was refused.
create or replace function public.save_user(p_id text, p_doc jsonb, p_expected integer, p_updated bigint, p_wallet integer, p_link text)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare v integer;
begin
  if p_expected = 0 then
    insert into users (id, doc, version, updated_ms, wallet_paise, link_to)
    values (p_id, p_doc, 1, p_updated, p_wallet, p_link)
    on conflict (id) do nothing
    returning version into v;
    return v;
  end if;
  update users
     set doc = p_doc, version = users.version + 1, updated_ms = p_updated, wallet_paise = p_wallet, link_to = p_link
   where id = p_id and users.version = p_expected
  returning users.version into v;
  return v;
end $function$;

-- Adds to today's spend. Returns the day's totals after the add.
create or replace function public.add_spend(p_day date, p_llm numeric, p_msg numeric)
returns table(llm_inr numeric, msg_inr numeric)
language sql
set search_path to 'public'
as $function$
  insert into spend_daily (day, llm_inr, msg_inr) values (p_day, p_llm, p_msg)
  on conflict (day) do update
     set llm_inr = spend_daily.llm_inr + excluded.llm_inr,
         msg_inr = spend_daily.msg_inr + excluded.msg_inr
  returning spend_daily.llm_inr, spend_daily.msg_inr;
$function$;

-- Spend today and this month so far, and how many people were active today.
create or replace function public.spend_snapshot(p_day date)
returns table(today_inr numeric, month_inr numeric, llm_inr numeric, msg_inr numeric, active_users integer)
language sql
stable
set search_path to 'public'
as $function$
  select
    coalesce((select s.llm_inr + s.msg_inr from spend_daily s where s.day = p_day), 0),
    coalesce((select sum(s.llm_inr + s.msg_inr) from spend_daily s
               where s.day >= date_trunc('month', p_day)::date and s.day <= p_day), 0),
    coalesce((select s.llm_inr from spend_daily s where s.day = p_day), 0),
    coalesce((select s.msg_inr from spend_daily s where s.day = p_day), 0),
    (select count(*)::integer from user_daily u where u.day = p_day);
$function$;

-- Adds to one person's counters for the day. Returns their counts after the add.
create or replace function public.bump_user_day(p_day date, p_user text, p_llm integer, p_inbound integer)
returns table(llm integer, inbound integer)
language sql
set search_path to 'public'
as $function$
  insert into user_daily (day, user_id, llm, inbound) values (p_day, p_user, p_llm, p_inbound)
  on conflict (day, user_id) do update
     set llm = user_daily.llm + excluded.llm,
         inbound = user_daily.inbound + excluded.inbound
  returning user_daily.llm, user_daily.inbound;
$function$;

-- Counts one event for the day, overall (source '') and for its source.
create or replace function public.bump_stat(p_day date, p_event text, p_source text)
returns void
language sql
set search_path to 'public'
as $function$
  insert into stats_daily (day, event, source, n) values (p_day, p_event, coalesce(p_source, ''), 1)
  on conflict (day, event, source) do update set n = stats_daily.n + 1;
$function$;

-- Fixed-window rate limit. True while the key is within p_max hits in the current window.
create or replace function public.rate_hit(p_key text, p_window_ms bigint, p_max integer, p_now_ms bigint)
returns boolean
language plpgsql
set search_path to 'public'
as $function$
declare ws bigint := (p_now_ms / p_window_ms) * p_window_ms; cnt integer;
begin
  insert into rate_hits (k, window_start, n) values (p_key, ws, 1)
  on conflict (k) do update
     set n = case when rate_hits.window_start = excluded.window_start then rate_hits.n + 1 else 1 end,
         window_start = excluded.window_start
  returning n into cnt;
  return cnt <= p_max;
end $function$;
