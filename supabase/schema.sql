-- ArcherLab Edge: optional accounts and backup.
-- Run once in the Supabase SQL editor. Every row and file is private to its owner.

create table if not exists public.athlete_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.video_reports (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  summary jsonb not null,
  report jsonb,
  video_path text
);

create index if not exists video_reports_user_created_idx on public.video_reports (user_id, created_at desc);

alter table public.athlete_profiles enable row level security;
alter table public.video_reports enable row level security;

drop policy if exists "Own profile" on public.athlete_profiles;
create policy "Own profile" on public.athlete_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Own video reports" on public.video_reports;
create policy "Own video reports" on public.video_reports
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Private bucket for optional video backups, stored as <user id>/<report id>.<ext>.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists "Read own videos" on storage.objects;
create policy "Read own videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Upload own videos" on storage.objects;
create policy "Upload own videos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Replace own videos" on storage.objects;
create policy "Replace own videos" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Delete own videos" on storage.objects;
create policy "Delete own videos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
