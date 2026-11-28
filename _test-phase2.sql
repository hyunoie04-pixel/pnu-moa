-- 시험 프로젝트 전용: 2차 DB(팀·홍보)의 권한과 흐름을 가짜 회원 5명으로 검증. 운영에는 실행하지 않음.
create table if not exists public.zz_res (n serial, step text, ok boolean, info text);
alter table public.zz_res disable row level security;
truncate public.zz_res restart identity;
grant all on public.zz_res to authenticated, anon;
grant usage, select on sequence public.zz_res_n_seq to authenticated, anon;

delete from public.promo_posts;
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000000a%' or email = 'adm@test.dev';
insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-0000000000a1','l@test.dev','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000a2','a@test.dev','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000a3','s@test.dev','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000a4','o@test.dev','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000a5','adm@test.dev','authenticated','authenticated');
insert into public.profiles (id, nickname, college, dept, grade, skills, bio, onboarded) values
 ('00000000-0000-0000-0000-0000000000a1','팀장L','공과대학','기계공학부','3','{CAD}','소개L',true),
 ('00000000-0000-0000-0000-0000000000a2','지원자A','경영대학','경영학과','2','{기획}','소개A',true),
 ('00000000-0000-0000-0000-0000000000a3','구해요S','예술대학','디자인학과','2','{피그마}','소개S',true),
 ('00000000-0000-0000-0000-0000000000a4','제3자O','사회과학대학','신문방송학과','4','{}','소개O',true),
 ('00000000-0000-0000-0000-0000000000a5','관리자','공과대학','기계공학부','4','{}','',true);
insert into public.admin_emails values ('adm@test.dev') on conflict do nothing;

create or replace function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a'||p_n,'role','authenticated','email',(array['l','a','s','o','adm'])[p_n]||'@test.dev')::text, true);
  set local role authenticated;
end $$;

do $$
declare
  tid uuid; tid2 uuid; aid uuid; iid uuid; n int; v text; ok boolean; rid uuid; pid uuid; j jsonb;
  L constant int := 1; A constant int := 2; S constant int := 3; O constant int := 4; ADM constant int := 5;
  ctx text;
begin
  -- 1) 팀장 L: 팀 만들기
  perform pg_temp.as_user(L);
  insert into public.teams (leader_id, notice_key, notice_title, title, intro, roles, contact, deadline)
  values ('00000000-0000-0000-0000-0000000000a1','https://x/1','공모전1','데이터 같이 해요','소개글은 열 글자가 넘어요','[{"name":"디자인","need":1,"filled":9},{"name":"개발","need":2}]','open.kakao.com/o/abc','2099-01-01') returning id into tid;
  select (roles->0->>'filled')::int into n from public.teams where id=tid;
  insert into public.zz_res (step, ok, info) values ('팀 만들기 + filled는 서버가 0으로 셈', n=0, 'filled='||n);
  -- 팀 2개 더, 4번째는 막힘
  insert into public.teams (leader_id, notice_key, notice_title, title, intro, roles, contact) values ('00000000-0000-0000-0000-0000000000a1','https://x/2','공모전2','팀2','소개글은 열 글자가 넘어요','[{"name":"기획","need":1}]','a@b.c') returning id into tid2;
  insert into public.teams (leader_id, notice_key, notice_title, title, intro, roles, contact) values ('00000000-0000-0000-0000-0000000000a1','https://x/3','공모전3','팀3','소개글은 열 글자가 넘어요','[{"name":"기획","need":1}]','a@b.c');
  begin
    insert into public.teams (leader_id, notice_key, notice_title, title, intro, roles, contact) values ('00000000-0000-0000-0000-0000000000a1','https://x/4','공모전4','팀4','소개글은 열 글자가 넘어요','[{"name":"기획","need":1}]','a@b.c');
    insert into public.zz_res (step, ok, info) values ('모집 중 팀 3개 제한', false, '4번째가 들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('모집 중 팀 3개 제한', sqlerrm like '%too_many_open_teams%', sqlerrm); end;
  -- 남의 이름으로 팀 만들기 막힘
  begin
    insert into public.teams (leader_id, notice_key, notice_title, title, intro, roles, contact) values ('00000000-0000-0000-0000-0000000000a2','https://x/5','공모전5','팀5','소개글은 열 글자가 넘어요','[{"name":"기획","need":1}]','a@b.c');
    insert into public.zz_res (step, ok, info) values ('다른 사람 이름으로 팀 만들기 막힘', false, '들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('다른 사람 이름으로 팀 만들기 막힘', true, sqlerrm); end;
  -- 연락처 칼럼 직접 읽기 막힘
  begin
    perform contact from public.teams where id=tid;
    insert into public.zz_res (step, ok, info) values ('팀장도 contact 칼럼 직접 select 막힘', false, '읽힘');
  exception when others then insert into public.zz_res (step, ok, info) values ('팀장도 contact 칼럼 직접 select 막힘', true, sqlerrm); end;
  select public.team_contact(tid) into v;
  insert into public.zz_res (step, ok, info) values ('팀장은 team_contact로 연락처 확인', v='open.kakao.com/o/abc', v);
  -- report_count 직접 수정 무시
  update public.teams set title='수정된 제목' where id=tid;
  reset role;

  -- 2) 지원자 A
  perform pg_temp.as_user(A);
  select public.apply_team(tid,'디자인','디자인 맡을게요') into aid;
  insert into public.zz_res (step, ok, info) values ('지원하기', aid is not null, aid::text);
  begin perform public.apply_team(tid,'디자인','또 지원할게요요'); insert into public.zz_res values (default,'중복 지원 막힘', false, '들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('중복 지원 막힘', sqlerrm like '%already_applied%', sqlerrm); end;
  begin update public.team_applications set status='accepted' where id=aid; get diagnostics n = row_count; insert into public.zz_res (step, ok, info) values ('지원자가 스스로 수락 못 함', n=0, 'rows='||n);
  exception when others then insert into public.zz_res (step, ok, info) values ('지원자가 스스로 수락 못 함', true, sqlerrm); end;
  select public.team_contact(tid) into v;
  insert into public.zz_res (step, ok, info) values ('합류 전 지원자는 연락처 못 봄', v is null, coalesce(v,'null'));
  select count(*) into n from public.team_applications where team_id=tid;
  insert into public.zz_res (step, ok, info) values ('지원자는 자기 지원만 보임', n=1, 'n='||n);
  reset role;

  -- 3) 제3자 O: 지원 목록·연락처 못 봄, 팀은 보임
  perform pg_temp.as_user(O);
  select count(*) into n from public.team_applications;
  insert into public.zz_res (step, ok, info) values ('제3자는 지원 목록 0건', n=0, 'n='||n);
  select count(*) into n from public.teams where id=tid;
  insert into public.zz_res (step, ok, info) values ('제3자도 팀 글은 읽음', n=1, 'n='||n);
  select count(*) into n from public.member_cards where id='00000000-0000-0000-0000-0000000000a1';
  insert into public.zz_res (step, ok, info) values ('모집 글만 본 제3자에게 팀장 카드는 안 보임', n=0, 'n='||n);
  select count(*) into n from public.member_cards where id='00000000-0000-0000-0000-0000000000a2';
  insert into public.zz_res (step, ok, info) values ('지원자 카드는 제3자에게 안 보임', n=0, 'n='||n);
  update public.teams set status='hidden' where id=tid; get diagnostics n = row_count;
  insert into public.zz_res (step, ok, info) values ('제3자가 남의 팀 숨김 못 함', n=0, 'rows='||n);
  -- 신고
  insert into public.reports (target_type,target_id,user_id,reason) values ('team',tid,'00000000-0000-0000-0000-0000000000a4','광고·홍보');
  begin insert into public.reports (target_type,target_id,user_id,reason) values ('team',tid,'00000000-0000-0000-0000-0000000000a4','또 신고'); insert into public.zz_res values (default,'중복 신고 막힘', false,'들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('중복 신고 막힘', true, sqlerrm); end;
  begin insert into public.reports (target_type,target_id,user_id,reason) values ('team',tid,'00000000-0000-0000-0000-0000000000a2','남 이름으로'); insert into public.zz_res values (default,'남 이름으로 신고 막힘', false,'들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('남 이름으로 신고 막힘', true, sqlerrm); end;
  reset role;
  select report_count into n from public.teams where id=tid;
  insert into public.zz_res (step, ok, info) values ('신고 수가 트리거로 1', n=1, 'report_count='||n);

  -- 4) 팀장 L: 지원 수락 → 인원 반영, 지원자는 연락처 열림
  perform pg_temp.as_user(L);
  perform public.decide_application(aid,'accepted');
  select (roles->0->>'filled')::int into n from public.teams where id=tid;
  insert into public.zz_res (step, ok, info) values ('수락하면 디자인 filled=1', n=1, 'filled='||n);
  begin perform public.decide_application(aid,'rejected'); insert into public.zz_res values (default,'이미 수락한 지원 재결정 막힘', false,'됨');
  exception when others then insert into public.zz_res (step, ok, info) values ('이미 수락한 지원 재결정 막힘', sqlerrm like '%bad_decision%', sqlerrm); end;
  reset role;
  perform pg_temp.as_user(A);
  select public.team_contact(tid) into v;
  insert into public.zz_res (step, ok, info) values ('수락된 팀원은 연락처 확인', v='open.kakao.com/o/abc', coalesce(v,'null'));
  select count(*) into n from public.member_cards where id='00000000-0000-0000-0000-0000000000a1';
  insert into public.zz_res (step, ok, info) values ('합류한 팀원에게는 팀장 카드가 보임', n=1, 'n='||n);
  perform public.leave_team(tid);
  select (roles->0->>'filled')::int into n from public.teams where id=tid;
  insert into public.zz_res (step, ok, info) values ('나가면 filled=0', n=0, 'filled='||n);
  reset role;

  -- 5) 팀 구해요 S + 초대 + 수락
  perform pg_temp.as_user(S);
  insert into public.team_seekers (user_id, notice_key, notice_title, roles, intro) values ('00000000-0000-0000-0000-0000000000a3','https://x/1','공모전1','{개발}','개발 가능해요');
  begin insert into public.team_seekers (user_id, roles, intro) values ('00000000-0000-0000-0000-0000000000a3','{기획}','두 번째 글'); insert into public.zz_res values (default,'팀 구해요는 1개만', false,'들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('팀 구해요는 1개만', true, sqlerrm); end;
  reset role;
  perform pg_temp.as_user(L);
  select count(*) into n from public.member_cards where id='00000000-0000-0000-0000-0000000000a3';
  insert into public.zz_res (step, ok, info) values ('열린 팀 구해요 작성자 카드는 보임', n=1, 'n='||n);
  select public.invite_member(tid,'00000000-0000-0000-0000-0000000000a3','개발','같이 해요') into iid;
  begin perform public.invite_member(tid,'00000000-0000-0000-0000-0000000000a3','개발','또'); insert into public.zz_res values (default,'중복 초대 막힘', false,'됨');
  exception when others then insert into public.zz_res (step, ok, info) values ('중복 초대 막힘', true, sqlerrm); end;
  reset role;
  perform pg_temp.as_user(O);
  begin perform public.answer_invite(iid,true); insert into public.zz_res values (default,'남의 초대에 답 못 함', false,'됨');
  exception when others then insert into public.zz_res (step, ok, info) values ('남의 초대에 답 못 함', sqlerrm like '%not_found%', sqlerrm); end;
  reset role;
  perform pg_temp.as_user(S);
  perform public.answer_invite(iid,true);
  select count(*) into n from public.team_applications where team_id=tid and user_id='00000000-0000-0000-0000-0000000000a3' and status='accepted';
  insert into public.zz_res (step, ok, info) values ('초대 수락하면 합류', n=1, 'n='||n);
  select count(*) into n from public.team_seekers where user_id='00000000-0000-0000-0000-0000000000a3' and status='open';
  insert into public.zz_res (step, ok, info) values ('합류하면 내 팀 구해요 글 닫힘', n=0, 'open='||n);
  reset role;

  -- 6) 초대 링크 합류 (O) + 초대 코드는 팀장만
  perform pg_temp.as_user(L);
  select public.team_invite_code(tid) into v;
  reset role;
  perform pg_temp.as_user(O);
  begin perform public.team_invite_code(tid); insert into public.zz_res values (default,'제3자는 초대 코드 못 봄', false,'봄');
  exception when others then insert into public.zz_res (step, ok, info) values ('제3자는 초대 코드 못 봄', sqlerrm like '%not_leader%', sqlerrm); end;
  perform public.join_team_by_code(v,'개발');
  select count(*) into n from public.team_applications where team_id=tid and user_id='00000000-0000-0000-0000-0000000000a4' and status='accepted';
  insert into public.zz_res (step, ok, info) values ('초대 링크로 합류', n=1, 'n='||n);
  reset role;
  perform set_config('request.jwt.claims','{}',true);
  set local role anon;
  select count(*) into n from public.team_by_code(v);
  insert into public.zz_res (step, ok, info) values ('로그인 전에도 초대 링크 미리보기', n=1, 'n='||n);
  begin perform 1 from public.teams limit 1; insert into public.zz_res values (default,'비로그인은 teams 못 읽음', false,'읽힘');
  exception when others then insert into public.zz_res (step, ok, info) values ('비로그인은 teams 못 읽음', true, sqlerrm); end;
  reset role;

  -- 7) 관리자: 팀 숨김 → 일반 회원에게 안 보임, 신고 처리
  perform pg_temp.as_user(ADM);
  update public.teams set status='hidden' where id=tid2; get diagnostics n = row_count;
  insert into public.zz_res (step, ok, info) values ('관리자는 팀 숨김', n=1, 'rows='||n);
  update public.reports set status='done' where target_id=tid; get diagnostics n = row_count;
  insert into public.zz_res (step, ok, info) values ('관리자는 신고 처리', n=1, 'rows='||n);
  select count(*) into n from public.reports;
  insert into public.zz_res (step, ok, info) values ('관리자는 신고 전체 열람', n=1, 'n='||n);
  j := public.admin_members_overview();
  insert into public.zz_res (step, ok, info) values ('관리자 회원 집계', (j->>'total')::int >= 5, left(j::text, 120));
  reset role;
  perform pg_temp.as_user(O);
  select count(*) into n from public.teams where id=tid2;
  insert into public.zz_res (step, ok, info) values ('숨긴 팀은 일반 회원에게 안 보임', n=0, 'n='||n);
  begin perform public.admin_members_overview(); insert into public.zz_res values (default,'일반 회원은 관리자 집계 못 봄', false,'봄');
  exception when others then insert into public.zz_res (step, ok, info) values ('일반 회원은 관리자 집계 못 봄', sqlerrm like '%admin_only%', sqlerrm); end;
  select count(*) into n from public.reports;
  insert into public.zz_res (step, ok, info) values ('일반 회원은 남의 신고 못 봄(내 신고만)', n=1, 'n='||n);
  reset role;

  -- 8) 홍보 게시판
  perform pg_temp.as_user(A);
  insert into public.promo_posts (title, org, kind, summary, state, pinned, source, sponsored, requester) values ('동아리 모집','사진동아리','동아리·학회 모집','매주 출사해요','published',true,'admin',true,'00000000-0000-0000-0000-0000000000a2') returning id into pid;
  select state||'/'||pinned::text||'/'||source||'/'||sponsored::text into v from public.promo_posts where id=pid;
  insert into public.zz_res (step, ok, info) values ('학생 요청은 pending·고정X·AD X로 강제', v='pending/false/request/false', v);
  insert into public.promo_posts (title, org, kind, summary, requester) values ('요청2','단체','기타','소개글입니다','00000000-0000-0000-0000-0000000000a2');
  insert into public.promo_posts (title, org, kind, summary, requester) values ('요청3','단체','기타','소개글입니다','00000000-0000-0000-0000-0000000000a2');
  begin insert into public.promo_posts (title, org, kind, summary, requester) values ('요청4','단체','기타','소개글입니다','00000000-0000-0000-0000-0000000000a2'); insert into public.zz_res values (default,'대기 요청 3건 제한', false,'들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('대기 요청 3건 제한', sqlerrm like '%too_many_pending%', sqlerrm); end;
  begin insert into public.promo_posts (title, org, kind, summary, requester) values ('번호','단체','기타','연락 010-1234-5678','00000000-0000-0000-0000-0000000000a2'); insert into public.zz_res values (default,'전화번호 글 차단', false,'들어감');
  exception when others then insert into public.zz_res (step, ok, info) values ('전화번호 글 차단', true, sqlerrm); end;
  begin update public.promo_posts set state='published' where id=pid; get diagnostics n=row_count; insert into public.zz_res (step, ok, info) values ('학생이 스스로 게시 못 함', n=0, 'rows='||n);
  exception when others then insert into public.zz_res (step, ok, info) values ('학생이 스스로 게시 못 함', true, sqlerrm); end;
  begin perform requester from public.promo_posts limit 1; insert into public.zz_res values (default,'requester 칼럼은 못 읽음', false,'읽힘');
  exception when others then insert into public.zz_res (step, ok, info) values ('requester 칼럼은 못 읽음', true, sqlerrm); end;
  reset role;
  perform pg_temp.as_user(ADM);
  update public.promo_posts set state='published' where id=pid; get diagnostics n=row_count;
  insert into public.zz_res (step, ok, info) values ('관리자 승인(게시)', n=1, 'rows='||n);
  insert into public.promo_posts (title, org, kind, summary, state, source, sponsored, pinned) values ('관리자 글','학생회','학생회 소식','관리자가 직접 올림','published','admin',true,true);
  reset role;
  perform set_config('request.jwt.claims','{}',true);
  set local role anon;
  select count(*) into n from public.promo_posts;
  insert into public.zz_res (step, ok, info) values ('비로그인은 게시 중인 글만(2건)', n=2, 'n='||n);
  perform public.promo_hit(pid,'view'); perform public.promo_hit(pid,'click');
  reset role;
  select views||'/'||clicks into v from public.promo_posts where id=pid;
  insert into public.zz_res (step, ok, info) values ('열람·클릭 수 증가', v='1/1', v);

  -- 9) 탈퇴하면 팀·지원·구해요·초대가 함께 지워짐
  perform pg_temp.as_user(L);
  perform public.delete_my_account();
  reset role;
  select count(*) into n from public.teams where leader_id='00000000-0000-0000-0000-0000000000a1';
  insert into public.zz_res (step, ok, info) values ('팀장 탈퇴하면 그 팀도 삭제', n=0, 'n='||n);
exception when others then
  get stacked diagnostics ctx = pg_exception_context;
  reset role;
  insert into public.zz_res (step, ok, info) values ('!! 테스트 중단', false, sqlerrm||' @ '||replace(ctx,chr(10),' / '));
end $$;

select (select count(*) from public.zz_res where ok) as pass, (select count(*) from public.zz_res where not ok) as fail, (select string_agg(step||': '||left(info,250), ' || ' order by n) from public.zz_res where not ok) as failed;
