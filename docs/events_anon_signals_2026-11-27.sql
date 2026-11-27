-- =====================================================================
-- 익명 이용 신호 확장 + 공고 영구 보관 (운영 적용 2026-11-27)
--  1) events: 공고 키·목록 위치·방식·묶음 칸 추가 (+ 익명 insert 권한 — 11/26 keyword·sub 누락 재발 방지)
--  2) events 종류: 노출·목록 클릭·공고 체류·저장/해제·공유·결과 없는 검색·캘린더 담기
--  3) 세션당 도배 제한 150 → 300 (노출은 15건씩 묶어 1줄이라 늘어나는 줄 수는 적음)
--  4) notices_archive: 시트에서 빠져 notices에서 지워진 공고도 남겨, 지난 열람 기록과 분류를 계속 연결
-- 로그인·계정 정보는 모으지 않음(방문자 임의 코드 단위). 되돌리기는 맨 아래.
-- =====================================================================
begin;

alter table public.events
  add column if not exists notice_key text check (notice_key is null or char_length(notice_key) <= 600),
  add column if not exists list text check (list is null or char_length(list) <= 30),
  add column if not exists pos int check (pos is null or pos between 0 and 1000),
  add column if not exists method text check (method is null or char_length(method) <= 20),
  add column if not exists extra jsonb check (extra is null or octet_length(extra::text) <= 6000);
grant insert (notice_key, list, pos, method, extra) on public.events to anon, authenticated;

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'visit','tab','notice','search','end','filter','outbound',
  'impression','list_click','dwell','save','unsave','share','search_zero','calendar_add'));

create or replace function public.events_flood_guard() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  if (select count(*) from public.events where session_id = new.session_id) >= 300 then
    raise exception 'too many events for this session' using errcode = 'P0001';
  end if;
  if (select count(*) from public.events where created_at > now() - interval '10 minutes') >= 5000 then
    raise exception 'too many events, try later' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create table if not exists public.notices_archive (
  row_key text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  removed_at timestamptz,                                -- 시트에서 빠져 notices에서 지워진 시각
  title text,
  subcategory text,
  data jsonb not null                                    -- 마지막으로 본 공고 행 전체
);
create index if not exists notices_archive_title_idx on public.notices_archive (title);

create or replace function public.notices_to_archive() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  if tg_op = 'DELETE' then
    update public.notices_archive set removed_at = now() where row_key = old.row_key;
    return old;
  end if;
  insert into public.notices_archive (row_key, title, subcategory, data)
  values (new.row_key, new.title, new.subcategory, to_jsonb(new))
  on conflict (row_key) do update
    set title = excluded.title, subcategory = excluded.subcategory, data = excluded.data,
        last_seen = now(), removed_at = null;
  return new;
end;
$function$;
drop trigger if exists notices_to_archive on public.notices;
create trigger notices_to_archive after insert or update or delete on public.notices
  for each row execute function public.notices_to_archive();

insert into public.notices_archive (row_key, title, subcategory, data)
select n.row_key, n.title, n.subcategory, to_jsonb(n) from public.notices n
on conflict (row_key) do nothing;

alter table public.notices_archive enable row level security;
revoke all on public.notices_archive from anon, authenticated;
grant select on public.notices_archive to authenticated;
drop policy if exists "admins read notices_archive" on public.notices_archive;
create policy "admins read notices_archive" on public.notices_archive for select to authenticated
  using (exists (select 1 from public.admin_emails));   -- 기존 events 정책과 같은 방식(admin_emails RLS가 본인 행만 보여 줌)
revoke execute on function public.notices_to_archive() from public, anon, authenticated;

commit;

-- 되돌리기 (필요할 때만)
-- begin;
-- drop trigger if exists notices_to_archive on public.notices;
-- drop function if exists public.notices_to_archive();
-- drop table if exists public.notices_archive;
-- alter table public.events drop constraint if exists events_type_check;
-- alter table public.events add constraint events_type_check check (type in ('visit','tab','notice','search','end','filter','outbound')) not valid;
-- (flood guard는 위 함수에서 300을 150으로 바꿔 다시 실행. 추가한 칸은 기록이 섞여 있어 지우지 않음)
-- commit;
