-- 2026-11-28 점검(Codex 교차 검토) 반영: 관리자 판정을 명시 함수로 통일
-- 기존 정책은 "admin_emails에서 행이 하나라도 보이면 관리자"였다. admin_emails의 RLS가 본인 행만 보여 줘서 지금은 안전하지만,
-- 그 설정 하나에 기대고 있어 public.is_hyoon_admin()(이메일 직접 비교)으로 바꾼다. 결과는 같다.
begin;
alter policy "admins read daily_stats"     on public.daily_stats     using (public.is_hyoon_admin());
alter policy "admins read events"          on public.events          using (public.is_hyoon_admin());
alter policy "admins read feedback"        on public.feedback        using (public.is_hyoon_admin());
alter policy "admins delete feedback"      on public.feedback        using (public.is_hyoon_admin());
alter policy "admins update feedback"      on public.feedback        using (public.is_hyoon_admin());
alter policy "admins read notices_archive" on public.notices_archive using (public.is_hyoon_admin());
commit;
select tablename, policyname, qual from pg_policies where schemaname='public' and qual ilike '%is_hyoon_admin%' order by 1;
