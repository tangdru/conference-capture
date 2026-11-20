-- Presentations whose real cost is known from the Anthropic console bill
-- rather than from cc_claude_usage rows. They count toward the measured
-- average cost of a presentation alongside the measured ones, so the
-- before-Nov-20 estimate can start without waiting for new presentations.
create table if not exists public.cc_presentation_cost_seed (
  id bigint generated always as identity primary key,
  presentations integer not null check (presentations > 0),
  total_usd numeric not null check (total_usd >= 0),
  note text
);

alter table public.cc_presentation_cost_seed enable row level security;

-- Latasha's 7 presentations on 2026-11-19 evening Eastern (Nov 20 UTC),
-- before tracking began: the console billed $3.84 that day
-- ($3.59 Opus 5.5 + $0.25 Sonnet 5.5) and nothing else ran on the key.
insert into public.cc_presentation_cost_seed (presentations, total_usd, note)
select 7, 3.84, 'Console bill for Nov 20 UTC: 7 free-list presentations before tracking'
where not exists (select 1 from public.cc_presentation_cost_seed);

create or replace view public.cc_presentation_cost_avg
with (security_invoker = true) as
with per as (
  select u.session_id,
    sum((u.input_tokens::numeric * p.input_per_m + u.output_tokens::numeric * p.output_per_m
      + u.cache_write_tokens::numeric * p.cache_write_per_m + u.cache_read_tokens::numeric * p.cache_read_per_m) / 1000000.0) as cost
  from public.cc_claude_usage u
  left join public.cc_claude_prices p on p.model = u.model
  where u.kind = 'presentation' and u.session_id is not null
  group by u.session_id
  having count(*) filter (where u.step = 'write') > 0
),
m as (select count(*) as n, coalesce(sum(cost), 0) as t from per),
s as (select coalesce(sum(presentations), 0) as n, coalesce(sum(total_usd), 0) as t from public.cc_presentation_cost_seed)
select (m.n + s.n)::integer as measured,
  case when m.n + s.n > 0 then (m.t + s.t) / (m.n + s.n) end as avg_cost_usd
from m, s;

revoke all on public.cc_presentation_cost_avg from anon, authenticated;
revoke all on public.cc_presentation_cost_seed from anon, authenticated;
