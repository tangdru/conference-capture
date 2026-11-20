-- Estimated spend on the shared key before tracking began (2026-11-20 04:30
-- UTC). Once at least 3 presentations have been measured, each person's past
-- presentations that ran on the key are priced at the measured average:
-- every presentation before 2026-11-15 (when the free list began limiting the
-- key), plus those from 11-15 to tracking start by people on the free list.
-- Until then the estimate is null. Asks before tracking aren't recorded, so
-- they aren't estimated.
create or replace view public.cc_presentation_cost_avg
with (security_invoker = true) as
with per as (
  select u.session_id, sum(
    (u.input_tokens * p.input_per_m + u.output_tokens * p.output_per_m
     + u.cache_write_tokens * p.cache_write_per_m + u.cache_read_tokens * p.cache_read_per_m) / 1000000.0
  ) as cost
  from public.cc_claude_usage u
  left join public.cc_claude_prices p on p.model = u.model
  where u.kind = 'presentation' and u.session_id is not null
  group by u.session_id
  having count(*) filter (where u.step = 'write') > 0
)
select count(*)::int as measured, avg(cost) as avg_cost_usd from per;

revoke all on public.cc_presentation_cost_avg from anon, authenticated;

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
),
past as (
  select s.owner_id as user_id, count(*) as past_key_presentations
  from public.cc_sessions s
  join people pp on pp.user_id = s.owner_id
  where s.deck_generated_at < '2026-11-15 00:00:00+00'
     or (pp.on_shared_key and s.deck_generated_at < '2026-11-20 04:30:00+00')
  group by s.owner_id
),
avgc as (select measured, avg_cost_usd from public.cc_presentation_cost_avg)
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
  greatest(s.last_session_activity, c.last_connector_use) as last_active,
  coalesce(past.past_key_presentations, 0) as past_key_presentations,
  case when avgc.measured >= 3 then round((coalesce(past.past_key_presentations, 0) * avgc.avg_cost_usd)::numeric, 2) end as est_past_cost_usd
from people p
cross join avgc
left join s on s.user_id = p.user_id
left join k on k.user_id = p.user_id
left join c on c.user_id = p.user_id
left join past on past.user_id = p.user_id
where s.user_id is not null or k.user_id is not null or c.user_id is not null;

revoke all on public.cc_usage_report from anon, authenticated;
