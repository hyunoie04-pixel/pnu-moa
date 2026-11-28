-- 2차(팀원 모집·홍보 게시판) 되돌리기. 팀·지원·초대·신고·홍보 글 데이터가 모두 지워져요. 1차(회원·일정·포트폴리오)는 그대로.
begin;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('hyoon-close-expired-teams');
  end if;
exception when others then null;
end $$;
drop view if exists public.member_cards;
drop function if exists public.admin_members_overview();
drop function if exists public.admin_event_counts(int);
drop function if exists public.my_promo_requests();
drop function if exists public.promo_hit(uuid, text);
drop table if exists public.promo_posts;
drop function if exists private.promo_guard();
drop function if exists public.team_contact(uuid), public.team_invite_code(uuid, boolean), public.team_by_code(text),
  public.join_team_by_code(text, text), public.answer_invite(uuid, boolean), public.cancel_invite(uuid),
  public.invite_member(uuid, uuid, text, text), public.decide_application(uuid, text), public.leave_team(uuid),
  public.withdraw_application(uuid), public.apply_team(uuid, text, text);
drop table if exists public.reports, public.team_invites, public.team_seekers, public.team_applications, public.teams;
drop function if exists private.reports_count(), private.team_sync(uuid, boolean), private.pick_role(uuid, text),
  private.teams_guard(), private.roles_counted(uuid, jsonb);
drop function if exists public.is_team_member(uuid);
-- public.is_hyoon_admin() 은 다른 곳에서 쓸 수 있어 남김
commit;
