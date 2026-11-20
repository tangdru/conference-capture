-- What each person's Claude calls cost on the shared API key (presentations
-- and Ask). Written by the generate-deck and ask-session functions with the
-- service role; nobody reads it from the app. Counts start 2026-11-20.
create table if not exists public.cc_claude_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid,
  -- 'presentation' or 'ask'
  kind text not null,
  -- Which call within it: 'write', 'name', 'organize', 'pick-slides', 'answer'
  step text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  -- A round cut off at its time limit: output is estimated from the text.
  estimated boolean not null default false
);

create index if not exists cc_claude_usage_user_time on public.cc_claude_usage (user_id, created_at);

alter table public.cc_claude_usage enable row level security;

-- Dollars per million tokens. Update a row when Anthropic's prices change.
create table if not exists public.cc_claude_prices (
  model text primary key,
  input_per_m numeric not null,
  output_per_m numeric not null,
  cache_write_per_m numeric not null,
  cache_read_per_m numeric not null
);

alter table public.cc_claude_prices enable row level security;

insert into public.cc_claude_prices (model, input_per_m, output_per_m, cache_write_per_m, cache_read_per_m) values
  ('claude-opus-5-5', 4, 20, 5, 0.20),
  ('claude-sonnet-5-5', 2, 10, 2.50, 0.10)
on conflict (model) do update set
  input_per_m = excluded.input_per_m,
  output_per_m = excluded.output_per_m,
  cache_write_per_m = excluded.cache_write_per_m,
  cache_read_per_m = excluded.cache_read_per_m;

-- One row per person per day, with the estimated cost. Service role only.
create or replace view public.cc_claude_usage_by_user
with (security_invoker = true) as
select
  u.user_id,
  coalesce(a.email, a.raw_user_meta_data ->> 'name', u.user_id::text) as who,
  (u.created_at at time zone 'America/New_York')::date as day,
  count(*) filter (where u.kind = 'presentation' and u.step = 'write') as presentation_rounds,
  count(*) filter (where u.kind = 'ask') as asks,
  sum(u.input_tokens + u.cache_write_tokens + u.cache_read_tokens) as input_tokens,
  sum(u.output_tokens) as output_tokens,
  round(sum(
    (u.input_tokens * p.input_per_m
     + u.output_tokens * p.output_per_m
     + u.cache_write_tokens * p.cache_write_per_m
     + u.cache_read_tokens * p.cache_read_per_m) / 1000000.0
  ), 4) as cost_usd
from public.cc_claude_usage u
left join public.cc_claude_prices p on p.model = u.model
left join auth.users a on a.id = u.user_id
group by u.user_id, who, day;

revoke all on public.cc_claude_usage_by_user from anon, authenticated;
