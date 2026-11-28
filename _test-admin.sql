-- 시험 프로젝트 전용: 관리자 화면 시험용 관리자 계정 (운영에는 실행하지 않음)
delete from auth.users where email = 'adm@test.dev';
do $$
declare u uuid := '00000000-0000-0000-0000-000000000199';
begin
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','adm@test.dev',crypt('Adm-test-9x!Qz',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
  values (gen_random_uuid(),u,jsonb_build_object('sub',u::text,'email','adm@test.dev'),'email',u::text,now(),now(),now());
  insert into public.admin_emails values ('adm@test.dev') on conflict do nothing;
end $$;
select email from public.admin_emails;
