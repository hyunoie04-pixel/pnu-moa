-- =====================================================================
-- 2차 DB (2026-11-28): 팀원 모집(모집글·지원·초대·팀 구해요·신고) + 홍보 게시판 + 관리자 집계
-- supabase-plus-schema.sql v2 에서 2차에 필요한 것만 뽑고, "부산대 인증 마크가 있어야 팀을 만들 수 있다"는 조건은 뺐다(부산대 인증은 이번에 안 함).
-- 전제: 1차(supabase-phase1.sql) 적용 완료(profiles·consents·user_calendar·portfolio_items·private 스키마), public.admin_emails 존재.
-- 다시 실행해도 같은 결과(if not exists / drop … if exists). 되돌리기는 supabase-phase2-rollback.sql
-- =====================================================================
begin;

do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.admin_emails') is null then
    raise exception '1차 테이블(public.profiles)이나 public.admin_emails가 없어 중단했어요';
  end if;
end $$;

create schema if not exists private;

create or replace function public.is_hyoon_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_emails where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.is_hyoon_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 팀원 모집
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users(id) on delete cascade,
  notice_key text not null check (char_length(notice_key) <= 600),
  notice_title text not null check (char_length(notice_title) <= 300),
  notice_end date,
  notice_poster text check (notice_poster is null or notice_poster ~ '^https://'),
  title text not null check (char_length(title) between 2 and 60),
  intro text not null check (char_length(intro) between 10 and 600),
  want text check (want is null or char_length(want) <= 120),
  roles jsonb not null,
  mode text check (mode is null or char_length(mode) <= 20),
  meet text check (meet is null or char_length(meet) <= 60),
  deadline date,
  contact text not null check (char_length(contact) between 2 and 120),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  status text not null default 'open' check (status in ('open','closed','hidden')),
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teams_notice_idx on public.teams (notice_key) where status = 'open';
create index if not exists teams_leader_idx on public.teams (leader_id);

create table if not exists public.team_applications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (char_length(role) <= 20),
  message text check (message is null or char_length(message) between 5 and 200),
  via text not null default 'apply' check (via in ('apply','invite','link')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id),
  check (via <> 'apply' or message is not null)
);
create index if not exists team_apps_user_idx on public.team_applications (user_id);
drop trigger if exists team_apps_touch on public.team_applications;
create trigger team_apps_touch before update on public.team_applications
  for each row execute function private.touch_updated_at();

create table if not exists public.team_seekers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_key text check (notice_key is null or char_length(notice_key) <= 600),
  notice_title text check (notice_title is null or char_length(notice_title) <= 300),
  roles text[] not null check (cardinality(roles) between 1 and 3),
  intro text not null check (char_length(intro) between 5 and 200),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create unique index if not exists team_seekers_one_open on public.team_seekers (user_id) where status = 'open';

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (char_length(role) <= 20),
  message text check (message is null or char_length(message) <= 150),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (from_id <> to_id)
);
create unique index if not exists team_invites_one_pending on public.team_invites (team_id, to_id) where status = 'pending';
create index if not exists team_invites_to_idx on public.team_invites (to_id) where status = 'pending';

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('team')),
  target_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) <= 200),
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now(),
  unique (target_id, user_id)
);

create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams t where t.id = p_team and t.leader_id = auth.uid())
      or exists (select 1 from public.team_applications a
                 where a.team_id = p_team and a.user_id = auth.uid() and a.status = 'accepted');
$$;
grant execute on function public.is_team_member(uuid) to anon, authenticated;

create or replace function private.roles_counted(p_team uuid, p_roles jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', e.r ->> 'name',
           'need', (e.r ->> 'need')::int,
           'filled', (select count(*) from public.team_applications a
                      where a.team_id = p_team and a.status = 'accepted' and a.role = e.r ->> 'name'))
         order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(p_roles) with ordinality as e(r, ord);
$$;

create or replace function private.teams_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_internal boolean := coalesce(current_setting('hyoon.internal', true), '') = '1';
begin
  if jsonb_typeof(new.roles) is distinct from 'array' or jsonb_array_length(new.roles) not between 1 and 6 then
    raise exception 'roles_invalid';
  end if;
  if exists (select 1 from jsonb_array_elements(new.roles) r
             where coalesce(r ->> 'name', '') = '' or char_length(r ->> 'name') > 20
                or coalesce(r ->> 'need', '') !~ '^[0-9]{1,2}$' or (r ->> 'need')::int not between 1 and 10)
     or (select count(distinct r ->> 'name') from jsonb_array_elements(new.roles) r) <> jsonb_array_length(new.roles) then
    raise exception 'roles_invalid';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.report_count := 0;
    new.roles := private.roles_counted(new.id, new.roles);
    if (select count(*) from public.teams where leader_id = new.leader_id and status = 'open') >= 3 then
      raise exception 'too_many_open_teams';
    end if;
    return new;
  end if;
  new.id := old.id; new.leader_id := old.leader_id; new.created_at := old.created_at;
  if exists (select 1 from public.team_applications a
             where a.team_id = old.id and a.status = 'accepted'
               and not exists (select 1 from jsonb_array_elements(new.roles) r where r ->> 'name' = a.role)) then
    raise exception 'role_in_use';
  end if;
  new.roles := private.roles_counted(old.id, new.roles);
  if exists (select 1 from jsonb_array_elements(new.roles) r where (r ->> 'filled')::int > (r ->> 'need')::int) then
    raise exception 'need_below_filled';
  end if;
  if not v_internal and not public.is_hyoon_admin() then
    new.report_count := old.report_count;
    new.invite_code := old.invite_code;
    if (new.status = 'hidden') <> (old.status = 'hidden') then raise exception 'admin_only'; end if;
    if new.status = 'open' and old.status <> 'open'
       and (select count(*) from public.teams where leader_id = old.leader_id and status = 'open' and id <> old.id) >= 3 then
      raise exception 'too_many_open_teams';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists teams_guard on public.teams;
create trigger teams_guard before insert or update on public.teams
  for each row execute function private.teams_guard();

create or replace function private.pick_role(p_team uuid, p_role text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_roles jsonb; v_name text;
begin
  select private.roles_counted(t.id, t.roles) into v_roles from public.teams t where t.id = p_team;
  if v_roles is null then raise exception 'team_not_found'; end if;
  select e.r ->> 'name' into v_name from jsonb_array_elements(v_roles) with ordinality as e(r, ord)
   where e.r ->> 'name' = p_role and (e.r ->> 'filled')::int < (e.r ->> 'need')::int;
  if v_name is null then
    select e.r ->> 'name' into v_name from jsonb_array_elements(v_roles) with ordinality as e(r, ord)
     where (e.r ->> 'filled')::int < (e.r ->> 'need')::int order by e.ord limit 1;
  end if;
  if v_name is null then raise exception 'team_full'; end if;
  return v_name;
end $$;

create or replace function private.team_sync(p_team uuid, p_reopen boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_need int; v_filled int;
begin
  perform set_config('hyoon.internal', '1', true);
  update public.teams t set roles = t.roles where t.id = p_team;
  select sum((r ->> 'need')::int), sum((r ->> 'filled')::int) into v_need, v_filled
    from public.teams t, jsonb_array_elements(t.roles) r where t.id = p_team;
  update public.teams t set status = case
      when t.status = 'open' and v_filled >= v_need then 'closed'
      when t.status = 'closed' and p_reopen and v_filled < v_need
           and coalesce(t.deadline, t.notice_end, 'infinity'::date) >= (now() at time zone 'Asia/Seoul')::date then 'open'
      else t.status end
   where t.id = p_team;
  perform set_config('hyoon.internal', '', true);
end $$;

create or replace function private.reports_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('hyoon.internal', '1', true);
  update public.teams set report_count = report_count + 1 where id = new.target_id;
  perform set_config('hyoon.internal', '', true);
  return new;
end $$;
drop trigger if exists reports_count on public.reports;
create trigger reports_count after insert on public.reports
  for each row execute function private.reports_count();

create or replace function public.apply_team(p_team uuid, p_role text, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'login_required'; end if;
  if not exists (select 1 from public.teams t where t.id = p_team and t.status = 'open' and t.leader_id <> v_uid
                 and exists (select 1 from jsonb_array_elements(t.roles) r where r ->> 'name' = p_role)) then
    raise exception 'team_not_open';
  end if;
  insert into public.team_applications (team_id, user_id, role, message, via, status)
  values (p_team, v_uid, p_role, p_message, 'apply', 'pending')
  on conflict (team_id, user_id) do update
    set role = excluded.role, message = excluded.message, via = 'apply', status = 'pending', created_at = now()
    where public.team_applications.status = 'withdrawn'
  returning id into v_id;
  if v_id is null then raise exception 'already_applied'; end if;
  return v_id;
end $$;

create or replace function public.withdraw_application(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.team_applications set status = 'withdrawn'
   where team_id = p_team and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;

create or replace function public.leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.team_applications set status = 'removed'
   where team_id = p_team and user_id = auth.uid() and status = 'accepted';
  if not found then raise exception 'not_member'; end if;
  perform private.team_sync(p_team, true);
end $$;

create or replace function public.decide_application(p_app uuid, p_decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_app public.team_applications;
begin
  select a.* into v_app from public.team_applications a join public.teams t on t.id = a.team_id
   where a.id = p_app and t.leader_id = auth.uid()
   for update of a;
  if not found then raise exception 'not_leader'; end if;
  if p_decision in ('accepted','rejected') and v_app.status = 'pending' then
    update public.team_applications
       set status = p_decision,
           role = case when p_decision = 'accepted' then private.pick_role(v_app.team_id, v_app.role) else role end
     where id = p_app;
    if p_decision = 'accepted' then perform private.team_sync(v_app.team_id, false); end if;
  elsif p_decision = 'removed' and v_app.status = 'accepted' then
    update public.team_applications set status = 'removed' where id = p_app;
    perform private.team_sync(v_app.team_id, true);
  else
    raise exception 'bad_decision';
  end if;
end $$;

create or replace function public.invite_member(p_team uuid, p_to uuid, p_role text, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if not exists (select 1 from public.teams t where t.id = p_team and t.leader_id = v_uid and t.status = 'open'
                 and exists (select 1 from jsonb_array_elements(t.roles) r where r ->> 'name' = p_role)) then
    raise exception 'not_leader_or_closed';
  end if;
  if p_to = v_uid or exists (select 1 from public.team_applications a
                             where a.team_id = p_team and a.user_id = p_to and a.status = 'accepted') then
    raise exception 'already_member';
  end if;
  if (select count(*) from public.team_invites where team_id = p_team and status = 'pending') >= 20 then
    raise exception 'too_many_invites';
  end if;
  insert into public.team_invites (team_id, from_id, to_id, role, message)
  values (p_team, v_uid, p_to, p_role, nullif(btrim(p_message), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.team_invites set status = 'expired', answered_at = now()
   where id = p_invite and from_id = auth.uid() and status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.answer_invite(p_invite uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inv public.team_invites; v_role text;
begin
  select * into v_inv from public.team_invites where id = p_invite and to_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if not p_accept then
    update public.team_invites set status = 'declined', answered_at = now() where id = p_invite;
    return;
  end if;
  if not exists (select 1 from public.teams where id = v_inv.team_id and status = 'open') then
    update public.team_invites set status = 'expired', answered_at = now() where id = p_invite;
    raise exception 'team_not_open';
  end if;
  v_role := private.pick_role(v_inv.team_id, v_inv.role);
  insert into public.team_applications (team_id, user_id, role, via, status)
  values (v_inv.team_id, v_uid, v_role, 'invite', 'accepted')
  on conflict (team_id, user_id) do update set role = excluded.role, via = 'invite', status = 'accepted';
  update public.team_invites set status = 'accepted', answered_at = now() where id = p_invite;
  update public.team_seekers set status = 'closed' where user_id = v_uid and status = 'open';
  perform private.team_sync(v_inv.team_id, false);
end $$;

create or replace function public.join_team_by_code(p_code text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_team public.teams; v_role text;
begin
  if v_uid is null then raise exception 'login_required'; end if;
  select * into v_team from public.teams where invite_code = p_code;
  if not found or v_team.status = 'hidden' then raise exception 'bad_code'; end if;
  if v_team.leader_id = v_uid or exists (select 1 from public.team_applications
      where team_id = v_team.id and user_id = v_uid and status = 'accepted') then
    return v_team.id;
  end if;
  if v_team.status <> 'open' then raise exception 'team_not_open'; end if;
  v_role := private.pick_role(v_team.id, p_role);
  insert into public.team_applications (team_id, user_id, role, via, status)
  values (v_team.id, v_uid, v_role, 'link', 'accepted')
  on conflict (team_id, user_id) do update set role = excluded.role, via = 'link', status = 'accepted';
  update public.team_invites set status = 'accepted', answered_at = now()
   where team_id = v_team.id and to_id = v_uid and status = 'pending';
  perform private.team_sync(v_team.id, false);
  return v_team.id;
end $$;

create or replace function public.team_by_code(p_code text) returns table (
  id uuid, title text, notice_title text, notice_end date, roles jsonb, status text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.notice_title, t.notice_end, t.roles, t.status
  from public.teams t where t.invite_code = p_code and t.status <> 'hidden';
$$;

create or replace function public.team_invite_code(p_team uuid, p_regenerate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not exists (select 1 from public.teams where id = p_team and leader_id = auth.uid()) then
    raise exception 'not_leader';
  end if;
  if p_regenerate then
    perform set_config('hyoon.internal', '1', true);
    update public.teams set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) where id = p_team;
    perform set_config('hyoon.internal', '', true);
  end if;
  select invite_code into v_code from public.teams where id = p_team;
  return v_code;
end $$;

create or replace function public.team_contact(p_team uuid) returns text
language sql stable security definer set search_path = '' as $$
  select t.contact from public.teams t
  where t.id = p_team and public.is_team_member(t.id);
$$;

-- 팀·팀 구해요·초대 화면에 띄울 회원 카드. 나와 관계 있는 사람만 보임(이메일·연락처는 없음)
create or replace view public.member_cards with (security_invoker = false) as
  select p.id, p.nickname, p.college, p.dept, p.grade, p.skills, p.bio, p.verified_pnu
  from public.profiles p
  where p.id = auth.uid()
     or exists (select 1 from public.team_seekers s where s.user_id = p.id and s.status = 'open')
     or exists (select 1 from public.teams t where t.leader_id = p.id and t.status <> 'hidden')
     or exists (select 1 from public.team_applications a join public.teams t on t.id = a.team_id
                where a.user_id = p.id
                  and (t.leader_id = auth.uid() or (a.status = 'accepted' and public.is_team_member(t.id))))
     or exists (select 1 from public.team_invites i
                where (i.from_id = p.id and i.to_id = auth.uid()) or (i.to_id = p.id and i.from_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 홍보 게시판
-- ---------------------------------------------------------------------
create table if not exists public.promo_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 60),
  org text not null check (char_length(org) between 1 and 40),
  kind text not null check (kind in ('동아리·학회 모집','소모임·스터디','교내 행사','학생회 소식','기타')),
  summary text not null check (char_length(summary) between 2 and 80),
  body text check (body is null or char_length(body) <= 1000),
  start_date date, end_date date,
  poster_url text check (poster_url is null or poster_url ~ '^https://'),
  link text check (link is null or link ~ '^https://'),
  pinned boolean not null default false,
  sponsored boolean not null default false,                -- 광고·제휴 표시(AD). 관리자만 정함
  state text not null default 'pending' check (state in ('pending','published','hidden','rejected')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 120),
  source text not null default 'request' check (source in ('admin','request')),
  requester uuid references auth.users(id) on delete set null,
  views int not null default 0, clicks int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), approved_at timestamptz,
  check (start_date is null or end_date is null or start_date <= end_date),
  check ((title || summary || coalesce(body, '')) !~ '01[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}')
);
create index if not exists promo_live_idx on public.promo_posts (state, end_date);

create or replace function private.promo_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('hyoon.internal', true), '') = '1' then return new; end if;   -- promo_hit 같은 내부 함수
  -- 탈퇴로 requester가 null이 되는 외래키 처리(다른 칸은 그대로)는 허용
  if tg_op = 'UPDATE' and old.requester is not null and new.requester is null
     and (to_jsonb(new) - 'requester' - 'updated_at') = (to_jsonb(old) - 'requester' - 'updated_at') then
    return new;
  end if;
  if public.is_hyoon_admin() then
    if tg_op = 'UPDATE' and new.state = 'published' and old.state <> 'published' then new.approved_at := now(); end if;
    if tg_op = 'INSERT' and new.source = 'admin' and new.state = 'published' then new.approved_at := now(); end if;
    new.updated_at := now(); return new;
  end if;
  if tg_op = 'INSERT' then
    new.state := 'pending'; new.pinned := false; new.sponsored := false; new.source := 'request'; new.requester := auth.uid();
    new.views := 0; new.clicks := 0; new.reject_reason := null; new.approved_at := null;
    if (select count(*) from public.promo_posts where requester = auth.uid() and state = 'pending') >= 3 then
      raise exception 'too_many_pending';
    end if;
  else
    raise exception 'admin_only';
  end if;
  return new;
end $$;
drop trigger if exists promo_guard on public.promo_posts;
create trigger promo_guard before insert or update on public.promo_posts for each row execute function private.promo_guard();

create or replace function public.promo_hit(p_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('hyoon.internal', '1', true);
  update public.promo_posts set views = views + (p_kind = 'view')::int, clicks = clicks + (p_kind = 'click')::int
   where id = p_id and state = 'published';
  perform set_config('hyoon.internal', '', true);
end $$;

-- 내가 요청한 홍보 (requester 칼럼은 일반 조회에서 숨기므로 이 함수로 내 글만 가져옴)
create or replace function public.my_promo_requests() returns setof public.promo_posts
language sql stable security definer set search_path = '' as $$
  select * from public.promo_posts where requester = auth.uid() order by created_at desc;
$$;

-- ---------------------------------------------------------------------
-- 관리자 집계 (회원 개인정보 없이 숫자만)
-- ---------------------------------------------------------------------
create or replace function public.admin_members_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_hyoon_admin() then raise exception 'admin_only'; end if;
  select jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'onboarded', (select count(*) from public.profiles where onboarded),
    'course', coalesce((select jsonb_object_agg(k, n) from (select coalesce(course,'(미입력)') k, count(*) n from public.profiles group by 1) a), '{}'),
    'college', coalesce((select jsonb_object_agg(k, n) from (select coalesce(college,'(미입력)') k, count(*) n from public.profiles group by 1) a), '{}'),
    'grade', coalesce((select jsonb_object_agg(k, n) from (select coalesce(grade,'(미입력)') k, count(*) n from public.profiles group by 1) a), '{}'),
    'jobs', coalesce((select jsonb_object_agg(k, n) from (select j k, count(*) n from public.profiles, unnest(jobs) j group by 1) a), '{}'),
    'signups_by_day', coalesce((select jsonb_object_agg(d, n) from (select to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD') d, count(*) n
                         from public.profiles where created_at > now() - interval '60 days' group by 1) a), '{}'),
    'consents', coalesce((select jsonb_object_agg(kind, jsonb_build_object('granted', g, 'declined', d)) from (
                         select kind, count(*) filter (where granted) g, count(*) filter (where not granted) d from public.consent_now group by 1) a), '{}'),
    'teams', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.teams group by 1) a), '{}'),
    'applications', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.team_applications group by 1) a), '{}'),
    'invites', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.team_invites group by 1) a), '{}'),
    'seekers_open', (select count(*) from public.team_seekers where status = 'open'),
    'reports_new', (select count(*) from public.reports where status = 'new'),
    'calendar_items', (select count(*) from public.user_calendar),
    'calendar_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.user_calendar group by 1) a), '{}')
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- RLS · 권한
-- ---------------------------------------------------------------------
alter table public.teams             enable row level security;
alter table public.team_applications enable row level security;
alter table public.team_seekers      enable row level security;
alter table public.team_invites      enable row level security;
alter table public.reports           enable row level security;
alter table public.promo_posts       enable row level security;

drop policy if exists "teams readable" on public.teams;
create policy "teams readable" on public.teams for select to authenticated
  using (status <> 'hidden' or leader_id = (select auth.uid()) or public.is_hyoon_admin());
drop policy if exists "teams by leader" on public.teams;
drop policy if exists "teams by verified leader" on public.teams;
create policy "teams by leader" on public.teams for insert to authenticated
  with check (leader_id = (select auth.uid())
              and exists (select 1 from public.profiles where id = (select auth.uid())));
drop policy if exists "teams leader edits" on public.teams;
create policy "teams leader edits" on public.teams for update to authenticated
  using (leader_id = (select auth.uid()) or public.is_hyoon_admin());
revoke all on public.teams from anon, authenticated;
grant select (id, leader_id, notice_key, notice_title, notice_end, notice_poster, title, intro, want, roles, mode, meet,
              deadline, status, report_count, created_at, updated_at) on public.teams to authenticated;
grant insert (leader_id, notice_key, notice_title, notice_end, notice_poster, title, intro, want, roles, mode, meet,
              deadline, contact) on public.teams to authenticated;
grant update (title, intro, want, roles, mode, meet, deadline, contact, status) on public.teams to authenticated;

drop policy if exists "see own or my team apps" on public.team_applications;
create policy "see own or my team apps" on public.team_applications for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.teams t where t.id = team_id and t.leader_id = (select auth.uid()))
         or (status = 'accepted' and public.is_team_member(team_id)));
revoke all on public.team_applications from anon, authenticated;
grant select on public.team_applications to authenticated;

drop policy if exists "seekers readable" on public.team_seekers;
create policy "seekers readable" on public.team_seekers for select to authenticated
  using (status = 'open' or user_id = (select auth.uid()));
drop policy if exists "own seeker" on public.team_seekers;
create policy "own seeker" on public.team_seekers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.team_seekers from anon, authenticated;
grant select on public.team_seekers to authenticated;
grant insert (user_id, notice_key, notice_title, roles, intro) on public.team_seekers to authenticated;
grant update (notice_key, notice_title, roles, intro, status) on public.team_seekers to authenticated;
grant delete on public.team_seekers to authenticated;

drop policy if exists "see own invites" on public.team_invites;
create policy "see own invites" on public.team_invites for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
revoke all on public.team_invites from anon, authenticated;
grant select on public.team_invites to authenticated;

drop policy if exists "report self" on public.reports;
create policy "report self" on public.reports for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "admin reads reports" on public.reports;
create policy "admin reads reports" on public.reports for select to authenticated using (public.is_hyoon_admin() or user_id = (select auth.uid()));
drop policy if exists "admin updates reports" on public.reports;
create policy "admin updates reports" on public.reports for update to authenticated using (public.is_hyoon_admin());
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (target_type, target_id, user_id, reason) on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

drop policy if exists "promo public read" on public.promo_posts;
create policy "promo public read" on public.promo_posts for select to anon, authenticated
  using ((state = 'published' and (start_date is null or start_date <= (now() at time zone 'Asia/Seoul')::date)
          and (end_date is null or end_date >= (now() at time zone 'Asia/Seoul')::date))
         or requester = (select auth.uid()) or public.is_hyoon_admin());
drop policy if exists "promo request" on public.promo_posts;
create policy "promo request" on public.promo_posts for insert to authenticated
  with check (requester = (select auth.uid()) or public.is_hyoon_admin());
drop policy if exists "promo admin" on public.promo_posts;
create policy "promo admin" on public.promo_posts for update to authenticated using (public.is_hyoon_admin());
drop policy if exists "promo admin delete" on public.promo_posts;
create policy "promo admin delete" on public.promo_posts for delete to authenticated using (public.is_hyoon_admin());
revoke all on public.promo_posts from anon, authenticated;
grant select (id, title, org, kind, summary, body, start_date, end_date, poster_url, link, pinned, sponsored, state, reject_reason,
              source, views, clicks, created_at, updated_at, approved_at) on public.promo_posts to anon, authenticated;
grant insert (title, org, kind, summary, body, start_date, end_date, poster_url, link, pinned, sponsored, state, source, requester)
  on public.promo_posts to authenticated;
grant update (title, org, kind, summary, body, start_date, end_date, poster_url, link, pinned, sponsored, state, reject_reason)
  on public.promo_posts to authenticated;
grant delete on public.promo_posts to authenticated;

-- 함수 실행 권한
revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.apply_team(uuid, text, text), public.withdraw_application(uuid), public.leave_team(uuid),
  public.decide_application(uuid, text), public.invite_member(uuid, uuid, text, text), public.cancel_invite(uuid),
  public.answer_invite(uuid, boolean), public.join_team_by_code(text, text), public.team_invite_code(uuid, boolean),
  public.team_contact(uuid), public.admin_members_overview()
  from public, anon;
grant execute on function
  public.apply_team(uuid, text, text), public.withdraw_application(uuid), public.leave_team(uuid),
  public.decide_application(uuid, text), public.invite_member(uuid, uuid, text, text), public.cancel_invite(uuid),
  public.answer_invite(uuid, boolean), public.join_team_by_code(text, text), public.team_invite_code(uuid, boolean),
  public.team_contact(uuid), public.admin_members_overview()
  to authenticated;
revoke execute on function public.team_by_code(text) from public;
grant execute on function public.team_by_code(text) to anon, authenticated;
revoke execute on function public.my_promo_requests() from public, anon;
grant execute on function public.my_promo_requests() to authenticated;
revoke execute on function public.promo_hit(uuid, text) from public;
grant execute on function public.promo_hit(uuid, text) to anon, authenticated;
revoke all on public.member_cards from public, anon, authenticated;
grant select on public.member_cards to authenticated;

commit;

-- 매일 한국 시간 00:05: 마감 지난 모집 닫기, 오래된 초대 만료 (pg_cron이 켜져 있을 때)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('hyoon-close-expired-teams', '5 15 * * *', $job$
      update public.teams set status = 'closed'
       where status = 'open' and coalesce(deadline, notice_end) < (now() at time zone 'Asia/Seoul')::date;
      update public.team_invites i set status = 'expired', answered_at = now()
       where i.status = 'pending'
         and (i.created_at < now() - interval '14 days'
              or exists (select 1 from public.teams t where t.id = i.team_id and t.status <> 'open'));
    $job$);
  end if;
end $$;
