-- ArcherLab Edge: optional accounts, backup and remote coach review.
-- Run in the Supabase SQL editor; it is safe to run again after an update.
-- Every row and file is private to its owner, except that an athlete can share a
-- single report (and optionally its video) read-only with a coach (see the end).

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

-- Lets a signed-in athlete delete their own account (Privacy page → "Delete my account").
-- Rows in athlete_profiles and video_reports go with it (on delete cascade), and with
-- them every share and comment on those reports, plus comments the user wrote as a coach. The app
-- deletes the athlete's files in the videos bucket first, because stored objects can
-- keep a user from being deleted.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Remote coach review (optional). An athlete shares one backed-up video report
-- with a coach's email address; both can then comment on it. Sharing never
-- gives a coach write access to the report, and a share can be revoked at any
-- time. Everything below is safe to run again.
-- ---------------------------------------------------------------------------

create table if not exists public.report_shares (
  id uuid primary key default gen_random_uuid(),
  report_id text not null references public.video_reports (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Shown to the coach so they know who shared the report.
  owner_email text default lower(auth.jwt() ->> 'email'),
  coach_email text not null check (coach_email = lower(coach_email) and coach_email like '%_@_%'),
  include_video boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (report_id, coach_email)
);

create index if not exists report_shares_coach_idx on public.report_shares (coach_email) where revoked_at is null;

create table if not exists public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id text not null references public.video_reports (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_email text default lower(auth.jwt() ->> 'email'),
  shot_index int check (shot_index is null or shot_index >= 0),
  time_s real check (time_s is null or time_s >= 0),
  body text not null check (char_length(body) between 1 and 2000 and btrim(body) <> ''),
  created_at timestamptz not null default now()
);

create index if not exists report_comments_report_idx on public.report_comments (report_id, created_at);

alter table public.report_shares enable row level security;
alter table public.report_comments enable row level security;

-- Policy helpers. They are security definer so a policy on one table can look at
-- another without re-entering that table's policies (video_reports and
-- report_shares refer to each other, which would otherwise recurse). Each one
-- only answers a yes/no question about the caller.

-- Does the caller own this report?
create or replace function public.owns_video_report(p_report_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.video_reports r
    where r.id = p_report_id and r.user_id = auth.uid()
  );
$$;

-- Is there an unrevoked share of this report with the caller's sign-in email?
create or replace function public.is_report_coach(p_report_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.report_shares s
    where s.report_id = p_report_id
      and s.revoked_at is null
      and s.coach_email = lower(auth.jwt() ->> 'email')
  );
$$;

-- Is this stored video attached to a report shared with the caller, with the video included?
create or replace function public.can_read_shared_video(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.report_shares s
    join public.video_reports r on r.id = s.report_id
    where r.video_path = p_object_name
      and s.include_video
      and s.revoked_at is null
      and s.coach_email = lower(auth.jwt() ->> 'email')
  );
$$;

revoke execute on function public.owns_video_report(text) from public, anon;
revoke execute on function public.is_report_coach(text) from public, anon;
revoke execute on function public.can_read_shared_video(text) from public, anon;
grant execute on function public.owns_video_report(text) to authenticated;
grant execute on function public.is_report_coach(text) to authenticated;
grant execute on function public.can_read_shared_video(text) to authenticated;

-- The athlete sees their own shares.
drop policy if exists "Owner reads shares" on public.report_shares;
create policy "Owner reads shares" on public.report_shares
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- New shares are only for reports the athlete owns, under their own id and email.
drop policy if exists "Owner adds shares" on public.report_shares;
create policy "Owner adds shares" on public.report_shares
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and public.owns_video_report(report_id)
    and owner_email is not distinct from lower((select auth.jwt()) ->> 'email')
  );

-- Revoking (or re-sharing) updates the athlete's own share; it cannot be moved to another report or owner.
drop policy if exists "Owner updates shares" on public.report_shares;
create policy "Owner updates shares" on public.report_shares
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and public.owns_video_report(report_id));

-- The athlete can also delete a share outright.
drop policy if exists "Owner deletes shares" on public.report_shares;
create policy "Owner deletes shares" on public.report_shares
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- A coach sees the active shares addressed to their sign-in email, and nothing else.
drop policy if exists "Coach sees own shares" on public.report_shares;
create policy "Coach sees own shares" on public.report_shares
  for select to authenticated
  using (revoked_at is null and coach_email = lower((select auth.jwt()) ->> 'email'));

-- A coach can read a report while an unrevoked share names their email. This is
-- select only: "Own video reports" above stays the only policy that allows
-- writes, so a coach can never change or delete the report.
drop policy if exists "Coaches read shared reports" on public.video_reports;
create policy "Coaches read shared reports" on public.video_reports
  for select to authenticated
  using (public.is_report_coach(id));

-- The owner and active coaches read every comment on the report.
drop policy if exists "Read report comments" on public.report_comments;
create policy "Read report comments" on public.report_comments
  for select to authenticated
  using (public.owns_video_report(report_id) or public.is_report_coach(report_id));

-- The owner and active coaches add comments, as themselves and under their own email.
drop policy if exists "Add report comments" on public.report_comments;
create policy "Add report comments" on public.report_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and author_email is not distinct from lower((select auth.jwt()) ->> 'email')
    and (public.owns_video_report(report_id) or public.is_report_coach(report_id))
  );

-- Authors delete their own comments. There is no update policy, so comments cannot be edited.
drop policy if exists "Delete own comments" on public.report_comments;
create policy "Delete own comments" on public.report_comments
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- A coach can read (and so get a signed URL for) the owner's video only while an
-- active share of that report has include_video ticked.
drop policy if exists "Coaches read shared videos" on storage.objects;
create policy "Coaches read shared videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and public.can_read_shared_video(name));
