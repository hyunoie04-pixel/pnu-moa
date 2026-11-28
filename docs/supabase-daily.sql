-- =====================================================================
-- 효온 하루 단위 분석 (daily_stats)  — 작성 2026-11-28, 운영 적용 전
--  1) analytics_exclude : 분석에서 뺄 방문자 코드(시험·내부)
--  2) daily_stats       : 한국 시간 하루 1행. 핵심 숫자 칸 + 세부 분포(jsonb). 원본 events가 나중에 정리돼도 요약은 남음
--  3) compute_daily_stats(day) / refresh_daily_stats(n) : 하루 계산 / 최근 n일 다시 계산
--  4) admin_daily(from, to) : 관리자 화면이 읽는 함수(관리자만)
--  5) pg_cron : 매시 10분에 오늘·어제를 다시 계산, 처음 한 번은 전체 날짜를 채움
-- 읽기·집계만 하고 events는 건드리지 않음. 되돌리기는 맨 아래.
-- 전제: public.events(칸: created_at, visitor_id, session_id, type, tab, notice_title, notice_key,
--       course, college, grade, device, src, ref, active_s, keyword, list, pos, method, extra), public.admin_emails
-- =====================================================================
begin;

create table if not exists public.analytics_exclude (
  visitor_id text primary key,
  note text,
  added_at timestamptz not null default now()
);
alter table public.analytics_exclude enable row level security;
revoke all on public.analytics_exclude from anon, authenticated;

create table if not exists public.daily_stats (
  day date primary key,                       -- 한국 시간 기준 날짜
  computed_at timestamptz not null default now(),
  visitors int not null default 0,            -- 그날 기록이 있는 방문자 코드 수
  new_visitors int not null default 0,        -- 이 코드의 첫 기록이 그날인 수
  returning_visitors int not null default 0,  -- 첫 기록이 그날 이전인 수
  sessions int not null default 0,
  visits int not null default 0,              -- visit 이벤트 수
  notice_views int not null default 0,        -- 공고를 연 횟수
  notice_viewers int not null default 0,      -- 공고를 연 방문자 수
  outbound int not null default 0,            -- 원문 이동
  outbound_viewers int not null default 0,
  searches int not null default 0,            -- 맞춤 검색(search)
  keyword_searches int not null default 0,    -- 검색어 입력(filter 중 keyword 있는 것)
  zero_searches int not null default 0,       -- 결과 없는 검색
  saves int not null default 0,
  unsaves int not null default 0,
  shares int not null default 0,
  calendar_adds int not null default 0,
  impressions int not null default 0,         -- 노출된 카드 수(묶음 안의 항목 합)
  list_clicks int not null default 0,
  avg_session_s numeric(8,1),                 -- end 이벤트 active_s 평균(초)
  median_session_s numeric(8,1),
  avg_dwell_s numeric(8,1),                   -- 공고 체류 dwell active_s 평균(초)
  breakdown jsonb not null default '{}'::jsonb  -- device·src·ref·tab·hourly·top_notices·college·course·grade·list
);
alter table public.daily_stats enable row level security;
revoke all on public.daily_stats from anon, authenticated;
grant select on public.daily_stats to authenticated;
drop policy if exists "admins read daily_stats" on public.daily_stats;
create policy "admins read daily_stats" on public.daily_stats for select to authenticated
  using (exists (select 1 from public.admin_emails));   -- 기존 events 정책과 같은 방식

create or replace function public.compute_daily_stats(p_day date) returns void
language plpgsql security definer set search_path to '' as $function$
declare
  t0 timestamptz := (p_day::timestamp at time zone 'Asia/Seoul');
  t1 timestamptz := ((p_day + 1)::timestamp at time zone 'Asia/Seoul');
  bd jsonb;
begin
  create temp table if not exists _ev (like public.events including defaults) on commit drop;
  truncate _ev;
  insert into _ev
    select e.* from public.events e
    where e.created_at >= t0 and e.created_at < t1
      and not exists (select 1 from public.analytics_exclude x where x.visitor_id = e.visitor_id);

  bd := jsonb_build_object(
    'device', coalesce((select jsonb_object_agg(k, n) from (select coalesce(device,'(없음)') k, count(distinct visitor_id) n from _ev group by 1) a), '{}'),
    'src',    coalesce((select jsonb_object_agg(k, n) from (select coalesce(src,'(없음)') k, count(*) n from _ev where type='visit' group by 1 order by 2 desc limit 15) a), '{}'),
    'ref',    coalesce((select jsonb_object_agg(k, n) from (select coalesce(ref,'(없음)') k, count(*) n from _ev where type='visit' group by 1 order by 2 desc limit 15) a), '{}'),
    'tab',    coalesce((select jsonb_object_agg(k, n) from (select coalesce(tab,'(없음)') k, count(*) n from _ev where type in ('visit','tab') group by 1) a), '{}'),
    'hourly', coalesce((select jsonb_agg(coalesce(h.n,0) order by g.hr)
                        from generate_series(0,23) g(hr)
                        left join (select extract(hour from created_at at time zone 'Asia/Seoul')::int hr, count(distinct visitor_id) n from _ev group by 1) h on h.hr = g.hr), '[]'),
    'top_notices', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'title', t, 'views', v, 'viewers', u, 'outbound', o, 'saves', s) order by v desc)
                        from (select coalesce(notice_key, notice_title) k, max(notice_title) t,
                                     count(*) filter (where type='notice') v,
                                     count(distinct visitor_id) filter (where type='notice') u,
                                     count(*) filter (where type='outbound') o,
                                     count(*) filter (where type='save') s
                              from _ev where type in ('notice','outbound','save') and coalesce(notice_key, notice_title) is not null
                              group by 1 order by 3 desc nulls last limit 10) q), '[]'),
    'college', coalesce((select jsonb_object_agg(k, n) from (select college k, count(distinct visitor_id) n from _ev where type='search' and college is not null group by 1) a), '{}'),
    'course',  coalesce((select jsonb_object_agg(k, n) from (select course k, count(distinct visitor_id) n from _ev where type='search' and course is not null group by 1) a), '{}'),
    'grade',   coalesce((select jsonb_object_agg(k, n) from (select grade k, count(distinct visitor_id) n from _ev where type='search' and grade is not null group by 1) a), '{}'),
    'list',    coalesce((select jsonb_object_agg(k, n) from (select list k, count(*) n from _ev where type='list_click' and list is not null group by 1) a), '{}'),
    'zero_keywords', coalesce((select jsonb_agg(k order by n desc) from (select keyword k, count(*) n from _ev where type='search_zero' and keyword is not null group by 1 order by 2 desc limit 10) a), '[]')
  );

  insert into public.daily_stats as d (day, computed_at, visitors, new_visitors, returning_visitors, sessions, visits,
      notice_views, notice_viewers, outbound, outbound_viewers, searches, keyword_searches, zero_searches,
      saves, unsaves, shares, calendar_adds, impressions, list_clicks, avg_session_s, median_session_s, avg_dwell_s, breakdown)
  select p_day, now(),
    count(distinct visitor_id),
    count(distinct visitor_id) filter (where not exists (
        select 1 from public.events p where p.visitor_id = _ev.visitor_id and p.created_at < t0)),
    count(distinct visitor_id) filter (where exists (
        select 1 from public.events p where p.visitor_id = _ev.visitor_id and p.created_at < t0)),
    count(distinct session_id),
    count(*) filter (where type='visit'),
    count(*) filter (where type='notice'),
    count(distinct visitor_id) filter (where type='notice'),
    count(*) filter (where type='outbound'),
    count(distinct visitor_id) filter (where type='outbound'),
    count(*) filter (where type='search'),
    count(*) filter (where type='filter' and keyword is not null and keyword <> ''),
    count(*) filter (where type='search_zero'),
    count(*) filter (where type='save'),
    count(*) filter (where type='unsave'),
    count(*) filter (where type='share'),
    count(*) filter (where type='calendar_add'),
    coalesce(sum(case when type='impression' then coalesce(jsonb_array_length(extra->'items'),0) else 0 end),0),
    count(*) filter (where type='list_click'),
    round((avg(active_s) filter (where type='end' and active_s > 0))::numeric, 1),
    round((percentile_cont(0.5) within group (order by active_s) filter (where type='end' and active_s > 0))::numeric, 1),
    round((avg(active_s) filter (where type='dwell' and active_s > 0))::numeric, 1),
    bd
  from _ev
  on conflict (day) do update set
    computed_at = excluded.computed_at, visitors = excluded.visitors, new_visitors = excluded.new_visitors,
    returning_visitors = excluded.returning_visitors, sessions = excluded.sessions, visits = excluded.visits,
    notice_views = excluded.notice_views, notice_viewers = excluded.notice_viewers, outbound = excluded.outbound,
    outbound_viewers = excluded.outbound_viewers, searches = excluded.searches, keyword_searches = excluded.keyword_searches,
    zero_searches = excluded.zero_searches, saves = excluded.saves, unsaves = excluded.unsaves, shares = excluded.shares,
    calendar_adds = excluded.calendar_adds, impressions = excluded.impressions, list_clicks = excluded.list_clicks,
    avg_session_s = excluded.avg_session_s, median_session_s = excluded.median_session_s,
    avg_dwell_s = excluded.avg_dwell_s, breakdown = excluded.breakdown;
end;
$function$;

-- 최근 n일(오늘 포함)을 다시 계산. n을 크게 주면 과거 전체를 채움(처음 한 번)
create or replace function public.refresh_daily_stats(p_days int default 2) returns int
language plpgsql security definer set search_path to '' as $function$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  d date; cnt int := 0;
begin
  for i in reverse (greatest(p_days,1) - 1)..0 loop
    d := today - i;
    perform public.compute_daily_stats(d);
    cnt := cnt + 1;
  end loop;
  return cnt;
end;
$function$;

-- 관리자 화면용: 기간의 일별 행. admin_emails에 있는 로그인 사용자만
create or replace function public.admin_daily(p_from date, p_to date) returns setof public.daily_stats
language sql stable security invoker set search_path to '' as $function$
  select * from public.daily_stats where day between p_from and p_to order by day;
$function$;
grant execute on function public.admin_daily(date, date) to authenticated;
revoke execute on function public.compute_daily_stats(date), public.refresh_daily_stats(int) from public, anon, authenticated;

-- 시험 기록(11/27 11:29 시험 탭)을 분석에서 뺌
insert into public.analytics_exclude (visitor_id, note)
select distinct visitor_id, '2026-11-27 시험 탭 기록' from public.events where id in (11568, 11569)
on conflict do nothing;

commit;

-- ---------------------------------------------------------------------
-- 처음 한 번: 지금까지의 모든 날짜 채우기 (events 가장 이른 날부터 오늘까지)
--   select public.refresh_daily_stats( ((now() at time zone 'Asia/Seoul')::date - (select min(created_at at time zone 'Asia/Seoul')::date from public.events)) + 1 );
-- 매시 10분에 오늘·어제 다시 계산 (pg_cron: Dashboard > Database > Extensions 에서 pg_cron 켜기)
--   select cron.schedule('hyoon-daily-stats', '10 * * * *', $$select public.refresh_daily_stats(2)$$);
-- 확인: select * from cron.job; / select day, visitors, notice_views from public.daily_stats order by day desc limit 7;
-- ---------------------------------------------------------------------
-- 되돌리기
--   select cron.unschedule('hyoon-daily-stats');
--   drop function if exists public.admin_daily(date, date), public.refresh_daily_stats(int), public.compute_daily_stats(date);
--   drop table if exists public.daily_stats, public.analytics_exclude;
