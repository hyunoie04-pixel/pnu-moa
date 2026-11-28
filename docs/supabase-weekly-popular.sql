-- "부산대 이번 주 인기" 실제 집계 (2026-11-28)
-- 최근 n일 익명 이용 기록에서 공고별로 본 사람·저장한 사람·원문으로 간 사람을 세어 점수순으로 돌려준다.
-- 누구나 호출 가능(사이트 홈 레일용)하지만 공고 키와 숫자만 돌려주고, 본 사람이 p_min명 미만인 공고는 빼서 개인 행동이 드러나지 않게 한다.
-- 분석 제외 방문자(analytics_exclude)는 세지 않는다.
create or replace function public.weekly_popular(p_days int default 7, p_limit int default 12, p_min int default 2)
returns table (notice_key text, viewers bigint, savers bigint, outbound bigint, score numeric)
language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.notice_key, e.visitor_id, e.type
      from public.events e
     where e.created_at > now() - make_interval(days => least(greatest(p_days, 1), 30))
       and e.notice_key is not null
       and e.type in ('notice', 'save', 'outbound')
       and not exists (select 1 from public.analytics_exclude x where x.visitor_id = e.visitor_id)
  ), agg as (
    select ev.notice_key,
           count(distinct ev.visitor_id) filter (where ev.type = 'notice')   as viewers,
           count(distinct ev.visitor_id) filter (where ev.type = 'save')     as savers,
           count(distinct ev.visitor_id) filter (where ev.type = 'outbound') as outbound
      from ev group by ev.notice_key
  )
  select a.notice_key, a.viewers, a.savers, a.outbound,
         (a.viewers + 3 * a.savers + 2 * a.outbound)::numeric as score
    from agg a
   where a.viewers >= greatest(p_min, 2)
   order by score desc, a.viewers desc
   limit least(greatest(p_limit, 1), 30);
$$;
revoke execute on function public.weekly_popular(int, int, int) from public;
grant execute on function public.weekly_popular(int, int, int) to anon, authenticated;
select * from public.weekly_popular(7, 12, 2);
