-- 홍보 게시판: 신청·문의 방법 자유 입력 + 포스터 사진 직접 올리기 (2026-11-28)
-- 1) promo_posts.link : https 주소만 → 자유 입력(인스타 아이디·오픈채팅·연락처 등, 최대 120자). 화면은 https 주소만 링크로 만들고 나머지는 글자로 보여 준다.
-- 2) promo_posts.poster_url : 외부 주소 → 우리 사진 저장소(promo-posters) 주소만(남의 서버 이미지로 방문자 IP가 새는 것도 막음)
-- 3) 사진 저장소 promo-posters: 공개 읽기, 로그인 회원이 자기 폴더에만 올리기(1MB·jpg/png/webp, 1인 10장까지), 본인·관리자 삭제
begin;

alter table public.promo_posts drop constraint if exists promo_posts_link_check;
alter table public.promo_posts add constraint promo_posts_link_check
  check (link is null or char_length(link) between 1 and 120);

alter table public.promo_posts drop constraint if exists promo_posts_poster_url_check;
alter table public.promo_posts add constraint promo_posts_poster_url_check
  check (poster_url is null or poster_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/promo-posters/[A-Za-z0-9._/-]{1,200}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promo-posters', 'promo-posters', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "promo poster upload" on storage.objects;
create policy "promo poster upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'promo-posters'
    and (
      public.is_hyoon_admin()
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select count(*) from storage.objects o where o.bucket_id = 'promo-posters' and o.owner = (select auth.uid())) < 10
      )
    )
  );

drop policy if exists "promo poster delete" on storage.objects;
create policy "promo poster delete" on storage.objects for delete to authenticated
  using (bucket_id = 'promo-posters' and (owner = (select auth.uid()) or public.is_hyoon_admin()));

commit;
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'promo-posters';
