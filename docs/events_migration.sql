-- Run this once in Supabase SQL Editor to enable keyword, category filter, and outbound click tracking in public.events
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('visit','tab','notice','search','end','filter','outbound'));

alter table public.events
  add column if not exists keyword text check (keyword is null or char_length(keyword) <= 80),
  add column if not exists sub text check (sub is null or char_length(sub) <= 30);
