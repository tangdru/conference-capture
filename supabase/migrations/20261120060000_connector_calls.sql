-- What people do with the "Use in Claude" connector (it runs on their own
-- Claude plan, so it costs nothing on the shared key): one row each time
-- Claude connects ('connect') and each tool it runs. Written by the mcp
-- function with the service role. Counts start 2026-11-20.
create table if not exists public.cc_connector_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tool text not null,
  ok boolean not null default true
);

create index if not exists cc_connector_calls_user_time on public.cc_connector_calls (user_id, created_at);

alter table public.cc_connector_calls enable row level security;

-- One row per person with any activity: sessions, presentations, Ask, the
-- connector, and what they cost on the shared key. Service role only.
create or replace view public.cc_usage_report
with (security_invoker = true) as
with people as (
  select a.id as user_id,
    coalesce(a.email, a.raw_user_meta_data ->> 'name', 'Account ' || left(a.id::text, 6)) as who,
    exists (select 1 from public.cc_free_users f where f.email = lower(a.email)) as on_shared_key
  from auth.users a
),
s as (
  select owner_id as user_id,
    count(*) as sessions,
    count(*) filter (where created_at > now() - interval '7 days') as sessions_7d,
    count(*) filter (where deck_generated_at is not null) as with_presentation,
    max(updated_at) as last_session_activity
  from public.cc_sessions group by owner_id
),
k as (
  select user_id,
    count(*) filter (where kind = 'presentation' and step = 'write') as key_presentation_rounds,
    count(*) filter (where kind = 'ask') as key_asks,
    sum(u.input_tokens + u.cache_write_tokens + u.cache_read_tokens) as key_input_tokens,
    sum(u.output_tokens) as key_output_tokens,
    round(sum(
      (u.input_tokens * p.input_per_m + u.output_tokens * p.output_per_m
       + u.cache_write_tokens * p.cache_write_per_m + u.cache_read_tokens * p.cache_read_per_m) / 1000000.0
    ), 4) as key_cost_usd
  from public.cc_claude_usage u left join public.cc_claude_prices p on p.model = u.model
  group by user_id
),
c as (
  select user_id,
    count(*) filter (where tool = 'connect') as connector_connects,
    count(*) filter (where tool <> 'connect') as connector_tool_calls,
    count(*) filter (where tool = 'save_presentation' and ok) as connector_presentations,
    max(created_at) as last_connector_use
  from public.cc_connector_calls group by user_id
)
select p.who, p.on_shared_key,
  coalesce(s.sessions, 0) as sessions,
  coalesce(s.sessions_7d, 0) as sessions_7d,
  coalesce(s.with_presentation, 0) as with_presentation,
  coalesce(k.key_presentation_rounds, 0) as key_presentation_rounds,
  coalesce(k.key_asks, 0) as key_asks,
  coalesce(k.key_input_tokens, 0) as key_input_tokens,
  coalesce(k.key_output_tokens, 0) as key_output_tokens,
  coalesce(k.key_cost_usd, 0) as key_cost_usd,
  coalesce(c.connector_connects, 0) as connector_connects,
  coalesce(c.connector_tool_calls, 0) as connector_tool_calls,
  coalesce(c.connector_presentations, 0) as connector_presentations,
  greatest(s.last_session_activity, c.last_connector_use) as last_active
from people p
left join s on s.user_id = p.user_id
left join k on k.user_id = p.user_id
left join c on c.user_id = p.user_id
where s.user_id is not null or k.user_id is not null or c.user_id is not null;

revoke all on public.cc_usage_report from anon, authenticated;
