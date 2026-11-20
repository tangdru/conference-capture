-- Estimated spend on the shared key per day (Eastern) before tracking began,
-- for the usage dashboard's running total: the presentations that
-- cc_usage_report counts as past key presentations, on the day each was
-- last made, times the average cost of a presentation. Null until 3 are
-- measured (seeded ones included).
create or replace view public.cc_daily_key_estimate
with (security_invoker = true) as
with past as (
  select (s.deck_generated_at at time zone 'America/New_York')::date as day, count(*) as presentations
  from public.cc_sessions s
  join auth.users a on a.id = s.owner_id
  where s.deck_generated_at < '2026-11-15 00:00:00+00'
     or (exists (select 1 from public.cc_free_users f where f.email = lower(a.email))
         and s.deck_generated_at < '2026-11-20 04:30:00+00')
  group by 1
)
select past.day, past.presentations,
  case when avgc.measured >= 3 then round((past.presentations * avgc.avg_cost_usd)::numeric, 4) end as est_cost_usd
from past cross join public.cc_presentation_cost_avg avgc;

revoke all on public.cc_daily_key_estimate from anon, authenticated;
