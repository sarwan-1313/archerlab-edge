-- ArcherLab Edge: optional accounts, backup and remote coach review.
-- Run in the Supabase SQL editor; it is safe to run again after an update.
-- Every row and file is private to its owner, except that an athlete can share a
-- single report (and optionally its video) read-only with a coach (see the end).

create table if not exists public.athlete_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The practice log (entries and weekly goals) as one JSON document per user.
create table if not exists public.practice_logs (
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
alter table public.practice_logs enable row level security;

drop policy if exists "Own practice log" on public.practice_logs;
create policy "Own practice log" on public.practice_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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
-- Rows in athlete_profiles, practice_logs and video_reports go with it (on delete cascade), and with
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

-- ---------------------------------------------------------------------------
-- Clubs (optional). A volunteer coach runs a club for a training ground and
-- hands out invite codes. An athlete joins with a code and decides what the
-- coach sees: by default only the display name they chose (and, for adults,
-- their sign-in email). Reports and the practice log are visible to the coach
-- only while the athlete has the matching sharing switch on, and leaving the
-- club ends all of it at once. Coaches never see a minor's email address.
-- Joining, changing sharing and leaving go through the functions below, so an
-- athlete cannot change their club, age flag or email on the membership row.
-- Everything below is safe to run again.
-- ---------------------------------------------------------------------------

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  coach_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists clubs_coach_idx on public.clubs (coach_id);

create table if not exists public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  athlete_id uuid not null references auth.users (id) on delete cascade,
  -- The only name the coach sees.
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  -- Set for adults only, from their sign-in; always null for a minor.
  athlete_email text,
  is_minor boolean not null default false,
  guardian_confirmed_at timestamptz,
  -- "Share my analyses with my club" and "Share my practice log with my club", both off by default.
  share_analyses boolean not null default false,
  share_practice_log boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (club_id, athlete_id),
  constraint club_members_minor_privacy check (not is_minor or (athlete_email is null and guardian_confirmed_at is not null))
);

create index if not exists club_members_athlete_idx on public.club_members (athlete_id) where left_at is null;

create table if not exists public.club_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  expires_at timestamptz not null,
  max_uses int not null check (max_uses between 1 and 500),
  uses int not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_invites enable row level security;

-- Policy helpers (security definer for the same reason as the coach review ones).

-- Does the caller coach this club?
create or replace function public.is_club_coach(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.clubs c where c.id = p_club_id and c.coach_id = auth.uid());
$$;

-- Is the caller a current member of this club?
create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.athlete_id = auth.uid() and m.left_at is null
  );
$$;

-- Does this athlete share their analyses with a club the caller coaches?
create or replace function public.club_shares_analyses(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    join public.clubs c on c.id = m.club_id
    where m.athlete_id = p_athlete_id and c.coach_id = auth.uid()
      and m.left_at is null and m.share_analyses
  );
$$;

-- Does this athlete share their practice log with a club the caller coaches?
create or replace function public.club_shares_practice_log(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    join public.clubs c on c.id = m.club_id
    where m.athlete_id = p_athlete_id and c.coach_id = auth.uid()
      and m.left_at is null and m.share_practice_log
  );
$$;

-- Can the caller see this report as the coach of a club its owner shares analyses with?
create or replace function public.is_club_report_coach(p_report_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.video_reports r
    where r.id = p_report_id and public.club_shares_analyses(r.user_id)
  );
$$;

revoke execute on function public.is_club_coach(uuid) from public, anon;
revoke execute on function public.is_club_member(uuid) from public, anon;
revoke execute on function public.club_shares_analyses(uuid) from public, anon;
revoke execute on function public.club_shares_practice_log(uuid) from public, anon;
revoke execute on function public.is_club_report_coach(text) from public, anon;
grant execute on function public.is_club_coach(uuid) to authenticated;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.club_shares_analyses(uuid) to authenticated;
grant execute on function public.club_shares_practice_log(uuid) to authenticated;
grant execute on function public.is_club_report_coach(text) to authenticated;

-- Clubs: the coach manages their own; a member sees only the clubs they belong to.
drop policy if exists "Coach manages own clubs" on public.clubs;
create policy "Coach manages own clubs" on public.clubs
  for all to authenticated
  using ((select auth.uid()) = coach_id)
  with check ((select auth.uid()) = coach_id);

drop policy if exists "Members see their clubs" on public.clubs;
create policy "Members see their clubs" on public.clubs
  for select to authenticated
  using (public.is_club_member(id));

-- Members: an athlete sees their own memberships (including ones they left);
-- the coach sees current members only. Athletes see no other members. There
-- are no insert or update policies: joining, sharing and leaving use the
-- functions below.
drop policy if exists "Athlete sees own memberships" on public.club_members;
create policy "Athlete sees own memberships" on public.club_members
  for select to authenticated
  using ((select auth.uid()) = athlete_id);

drop policy if exists "Coach sees current members" on public.club_members;
create policy "Coach sees current members" on public.club_members
  for select to authenticated
  using (left_at is null and public.is_club_coach(club_id));

-- An athlete can delete their own membership rows (Privacy page → delete cloud data).
drop policy if exists "Athlete deletes own memberships" on public.club_members;
create policy "Athlete deletes own memberships" on public.club_members
  for delete to authenticated
  using ((select auth.uid()) = athlete_id);

-- Invites: only the club's coach can see, create or delete them. Athletes
-- redeem a code through join_club and never read this table.
drop policy if exists "Coach manages invites" on public.club_invites;
create policy "Coach manages invites" on public.club_invites
  for all to authenticated
  using (public.is_club_coach(club_id))
  with check (public.is_club_coach(club_id));

-- A club coach reads (never writes) the reports and practice log of members who share them.
drop policy if exists "Club coaches read shared reports" on public.video_reports;
create policy "Club coaches read shared reports" on public.video_reports
  for select to authenticated
  using (public.club_shares_analyses(user_id));

drop policy if exists "Club coaches read shared practice logs" on public.practice_logs;
create policy "Club coaches read shared practice logs" on public.practice_logs
  for select to authenticated
  using (public.club_shares_practice_log(user_id));

-- Club coaches comment on shared reports like a coach with a direct share.
-- They read comments through club_report_comments below, which hides the
-- email of any author who is a minor.
drop policy if exists "Add report comments" on public.report_comments;
create policy "Add report comments" on public.report_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and author_email is not distinct from lower((select auth.jwt()) ->> 'email')
    and (public.owns_video_report(report_id) or public.is_report_coach(report_id) or public.is_club_report_coach(report_id))
  );

-- Join with an invite code. Rejoining restarts the membership with sharing off.
create or replace function public.join_club(p_code text, p_display_name text, p_is_minor boolean, p_guardian_confirmed boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.club_invites;
  v_coach uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_is_minor and not coalesce(p_guardian_confirmed, false) then
    raise exception 'A parent or guardian must agree before a minor joins a club.' using errcode = '22023';
  end if;
  select * into v_invite from public.club_invites
    where code = upper(btrim(p_code)) for update;
  if not found or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses then
    raise exception 'That invite code is not valid. It may have expired or been used up.' using errcode = 'P0002';
  end if;
  select coach_id into v_coach from public.clubs where id = v_invite.club_id;
  if v_coach = auth.uid() then
    raise exception 'You coach this club.' using errcode = '22023';
  end if;
  insert into public.club_members as m (club_id, athlete_id, display_name, athlete_email, is_minor, guardian_confirmed_at)
  values (
    v_invite.club_id, auth.uid(), btrim(p_display_name),
    case when p_is_minor then null else lower(auth.jwt() ->> 'email') end,
    p_is_minor,
    case when p_is_minor then now() else null end
  )
  on conflict (club_id, athlete_id) do update set
    display_name = excluded.display_name,
    athlete_email = excluded.athlete_email,
    is_minor = excluded.is_minor,
    guardian_confirmed_at = excluded.guardian_confirmed_at,
    share_analyses = false,
    share_practice_log = false,
    joined_at = case when m.left_at is null then m.joined_at else now() end,
    left_at = null;
  update public.club_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.club_id;
end;
$$;

-- Turn the athlete's sharing with one club on or off.
create or replace function public.set_club_sharing(p_club_id uuid, p_share_analyses boolean, p_share_practice_log boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.club_members
  set share_analyses = p_share_analyses, share_practice_log = p_share_practice_log
  where club_id = p_club_id and athlete_id = auth.uid() and left_at is null;
$$;

-- Leave a club. Sharing stops at once and the coach no longer sees the athlete.
create or replace function public.leave_club(p_club_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.club_members
  set left_at = now(), share_analyses = false, share_practice_log = false
  where club_id = p_club_id and athlete_id = auth.uid() and left_at is null;
$$;

-- Comments on a report, for its club coach: the email of an author who is a minor in one of the caller's clubs is left out.
create or replace function public.club_report_comments(p_report_id text)
returns setof public.report_comments
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.report_id, k.author_id,
    case when k.author_id <> auth.uid() and exists (
      select 1 from public.club_members m join public.clubs c on c.id = m.club_id
      where m.athlete_id = k.author_id and m.is_minor and c.coach_id = auth.uid()
    ) then null else k.author_email end,
    k.shot_index, k.time_s, k.body, k.created_at
  from public.report_comments k
  where public.is_club_report_coach(p_report_id) and k.report_id = p_report_id
  order by k.created_at, k.id;
$$;

revoke execute on function public.join_club(text, text, boolean, boolean) from public, anon;
revoke execute on function public.set_club_sharing(uuid, boolean, boolean) from public, anon;
revoke execute on function public.leave_club(uuid) from public, anon;
revoke execute on function public.club_report_comments(text) from public, anon;
grant execute on function public.join_club(text, text, boolean, boolean) to authenticated;
grant execute on function public.set_club_sharing(uuid, boolean, boolean) to authenticated;
grant execute on function public.leave_club(uuid) to authenticated;
grant execute on function public.club_report_comments(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Club community (optional). Inside a club, members and their coach can chat,
-- run forum threads, make polls and friendly predictions, share results to a
-- leaderboard and follow a shoot-off bracket. It is for the club only: nobody
-- outside the club can read or post, there are no private messages, links are
-- refused (so nothing can lure a young athlete off the app), and every post
-- carries only the display name the member chose when joining. The coach can
-- hide or delete anything, mute a member, and sees reports from members. A
-- member who leaves loses access at once. Everything below is safe to run
-- again, after the club section above.
-- ---------------------------------------------------------------------------

-- A muted member can still read, but not post, vote or share results. Only the coach changes it.
alter table public.club_members add column if not exists muted boolean not null default false;

-- Can the caller read this club's community (a current member, or the coach)?
create or replace function public.can_read_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_club_coach(p_club_id) or public.is_club_member(p_club_id);
$$;

-- Can the caller post in it (the coach, or a current member who is not muted)?
create or replace function public.can_post_in_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_club_coach(p_club_id) or exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.athlete_id = auth.uid() and m.left_at is null and not m.muted
  );
$$;

-- The only name shown on a post: the coach is "Coach", a member is the display name they chose.
create or replace function public.club_display_name(p_club_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_club_coach(p_club_id) then 'Coach'
    else (select m.display_name from public.club_members m where m.club_id = p_club_id and m.athlete_id = auth.uid() and m.left_at is null)
  end;
$$;

revoke execute on function public.can_read_club(uuid) from public, anon;
revoke execute on function public.can_post_in_club(uuid) from public, anon;
revoke execute on function public.club_display_name(uuid) from public, anon;
grant execute on function public.can_read_club(uuid) to authenticated;
grant execute on function public.can_post_in_club(uuid) to authenticated;
grant execute on function public.club_display_name(uuid) to authenticated;

-- Live chat.
create table if not exists public.club_chat (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 500 and body !~* '(https?:|www\.)'),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);
create index if not exists club_chat_club_idx on public.club_chat (club_id, created_at desc);

-- Forum: a thread has a title, a reply has a parent thread.
create table if not exists public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  parent_id uuid references public.club_posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  title text check (title is null or char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000 and body !~* '(https?:|www\.)'),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint club_posts_title_for_threads check ((parent_id is null) = (title is not null))
);
create index if not exists club_posts_club_idx on public.club_posts (club_id, created_at desc);
create index if not exists club_posts_parent_idx on public.club_posts (parent_id);

-- Polls and friendly predictions. A prediction is settled later by naming the right option.
create table if not exists public.club_polls (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  kind text not null check (kind in ('poll', 'prediction')),
  question text not null check (char_length(btrim(question)) between 1 and 200 and question !~* '(https?:|www\.)'),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8 and char_length(options::text) <= 1200 and options::text !~* '(https?:|www\.)'),
  closes_at timestamptz not null,
  correct_option int check (correct_option is null or correct_option >= 0),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint club_polls_settled_prediction check (correct_option is null or kind = 'prediction')
);
create index if not exists club_polls_club_idx on public.club_polls (club_id, created_at desc);

-- Votes are private: a member reads only their own, and everyone sees totals through club_poll_tally.
create table if not exists public.club_poll_votes (
  poll_id uuid not null references public.club_polls (id) on delete cascade,
  voter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  club_id uuid not null,
  option_index int not null check (option_index >= 0),
  voted_at timestamptz not null default now(),
  primary key (poll_id, voter_id)
);
create index if not exists club_poll_votes_club_idx on public.club_poll_votes (club_id);

-- Results a member chooses to share with the club, for the leaderboard (self-reported).
create table if not exists public.club_results (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  round_label text not null check (char_length(btrim(round_label)) between 1 and 60 and round_label !~* '(https?:|www\.)'),
  score int not null check (score >= 0),
  max_score int not null check (max_score > 0),
  arrows int not null check (arrows between 1 and 400),
  shot_on date not null default current_date,
  created_at timestamptz not null default now(),
  constraint club_results_score_within_max check (score <= max_score)
);
create index if not exists club_results_club_idx on public.club_results (club_id, shot_on desc);

-- A single-elimination shoot-off bracket the coach runs; winners is { "r0m1": 3, ... } (round, match -> entrant number).
create table if not exists public.club_brackets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  entrants jsonb not null check (jsonb_typeof(entrants) = 'array' and jsonb_array_length(entrants) between 2 and 16 and char_length(entrants::text) <= 1000),
  winners jsonb not null default '{}'::jsonb check (jsonb_typeof(winners) = 'object' and char_length(winners::text) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists club_brackets_club_idx on public.club_brackets (club_id, created_at desc);

-- Reports from members, read only by the coach. The server fills in who and what was reported.
create table if not exists public.club_reports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_table text not null check (item_table in ('club_chat', 'club_posts', 'club_polls')),
  item_id uuid not null,
  item_author_id uuid,
  item_author_name text,
  excerpt text,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (reporter_id, item_table, item_id)
);
create index if not exists club_reports_club_idx on public.club_reports (club_id, created_at desc);

-- Triggers: who wrote it, posting limits, and the checks a table constraint cannot express.
create or replace function public.club_stamp_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  new.author_name := coalesce(public.club_display_name(new.club_id), '');
  if new.author_name = '' then
    raise exception 'You are not a member of this club.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.club_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  execute format('select count(*) from public.%I where author_id = $1 and created_at > now() - make_interval(secs => $2)', tg_table_name)
    into v_count using new.author_id, tg_argv[1]::int;
  if v_count >= tg_argv[0]::int then
    raise exception 'You are posting too quickly. Wait a moment and try again.' using errcode = '54000';
  end if;
  return new;
end;
$$;

create or replace function public.club_check_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.club_posts p
    where p.id = new.parent_id and p.club_id = new.club_id and p.parent_id is null and p.hidden_at is null
  ) then
    raise exception 'That thread is not available.' using errcode = '22023';
  end if;
  new.hidden_at := null;
  return new;
end;
$$;

create or replace function public.club_check_poll()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.closes_at <= now() then
    raise exception 'Choose a closing time in the future.' using errcode = '22023';
  end if;
  if new.closes_at > now() + interval '120 days' then
    raise exception 'A poll can stay open for up to 120 days.' using errcode = '22023';
  end if;
  new.correct_option := null;
  new.hidden_at := null;
  return new;
end;
$$;

create or replace function public.club_check_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.club_polls;
begin
  if tg_op = 'UPDATE' and new.poll_id <> old.poll_id then
    raise exception 'A vote cannot move to another poll.' using errcode = '22023';
  end if;
  select * into v_poll from public.club_polls where id = new.poll_id;
  if not found or v_poll.hidden_at is not null then
    raise exception 'That poll is not available.' using errcode = 'P0002';
  end if;
  if v_poll.closes_at <= now() then
    raise exception 'Voting has closed.' using errcode = '22023';
  end if;
  if new.option_index >= jsonb_array_length(v_poll.options) then
    raise exception 'Choose one of the options.' using errcode = '22023';
  end if;
  if not public.can_post_in_club(v_poll.club_id) then
    raise exception 'You cannot vote in this club.' using errcode = '42501';
  end if;
  new.club_id := v_poll.club_id;
  new.voter_id := auth.uid();
  new.voted_at := now();
  return new;
end;
$$;

create or replace function public.club_stamp_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_author uuid;
  v_name text;
  v_excerpt text;
begin
  new.reporter_id := auth.uid();
  if new.item_table = 'club_chat' then
    select club_id, author_id, author_name, left(body, 160) into v_club, v_author, v_name, v_excerpt from public.club_chat where id = new.item_id;
  elsif new.item_table = 'club_posts' then
    select club_id, author_id, author_name, left(coalesce(title || ': ', '') || body, 160) into v_club, v_author, v_name, v_excerpt from public.club_posts where id = new.item_id;
  else
    select club_id, author_id, author_name, left(question, 160) into v_club, v_author, v_name, v_excerpt from public.club_polls where id = new.item_id;
  end if;
  if v_club is null or v_club <> new.club_id or not public.can_read_club(v_club) then
    raise exception 'That item is not available to report.' using errcode = 'P0002';
  end if;
  new.item_author_id := v_author;
  new.item_author_name := v_name;
  new.excerpt := v_excerpt;
  return new;
end;
$$;

revoke execute on function public.club_stamp_author() from public, anon, authenticated;
revoke execute on function public.club_rate_limit() from public, anon, authenticated;
revoke execute on function public.club_check_post() from public, anon, authenticated;
revoke execute on function public.club_check_poll() from public, anon, authenticated;
revoke execute on function public.club_check_vote() from public, anon, authenticated;
revoke execute on function public.club_stamp_report() from public, anon, authenticated;

drop trigger if exists club_chat_1_stamp on public.club_chat;
create trigger club_chat_1_stamp before insert on public.club_chat for each row execute function public.club_stamp_author();
drop trigger if exists club_chat_2_limit on public.club_chat;
create trigger club_chat_2_limit before insert on public.club_chat for each row execute function public.club_rate_limit(8, 30);

drop trigger if exists club_posts_1_stamp on public.club_posts;
create trigger club_posts_1_stamp before insert on public.club_posts for each row execute function public.club_stamp_author();
drop trigger if exists club_posts_2_check on public.club_posts;
create trigger club_posts_2_check before insert on public.club_posts for each row execute function public.club_check_post();
drop trigger if exists club_posts_3_limit on public.club_posts;
create trigger club_posts_3_limit before insert on public.club_posts for each row execute function public.club_rate_limit(6, 60);

drop trigger if exists club_polls_1_stamp on public.club_polls;
create trigger club_polls_1_stamp before insert on public.club_polls for each row execute function public.club_stamp_author();
drop trigger if exists club_polls_2_check on public.club_polls;
create trigger club_polls_2_check before insert on public.club_polls for each row execute function public.club_check_poll();
drop trigger if exists club_polls_3_limit on public.club_polls;
create trigger club_polls_3_limit before insert on public.club_polls for each row execute function public.club_rate_limit(3, 300);

drop trigger if exists club_results_1_stamp on public.club_results;
create trigger club_results_1_stamp before insert on public.club_results for each row execute function public.club_stamp_author();
drop trigger if exists club_results_2_limit on public.club_results;
create trigger club_results_2_limit before insert on public.club_results for each row execute function public.club_rate_limit(20, 600);

drop trigger if exists club_poll_votes_check on public.club_poll_votes;
create trigger club_poll_votes_check before insert or update on public.club_poll_votes for each row execute function public.club_check_vote();

drop trigger if exists club_reports_stamp on public.club_reports;
create trigger club_reports_stamp before insert on public.club_reports for each row execute function public.club_stamp_report();

alter table public.club_chat enable row level security;
alter table public.club_posts enable row level security;
alter table public.club_polls enable row level security;
alter table public.club_poll_votes enable row level security;
alter table public.club_results enable row level security;
alter table public.club_brackets enable row level security;
alter table public.club_reports enable row level security;

-- Chat, forum, polls and results: the club reads (hidden items only for the coach), a member who may post adds their own,
-- and the author or the coach deletes. Nothing can be edited, so what was said stays what was said.
drop policy if exists "Club reads chat" on public.club_chat;
create policy "Club reads chat" on public.club_chat for select to authenticated
  using (public.can_read_club(club_id) and (hidden_at is null or public.is_club_coach(club_id)));
drop policy if exists "Club adds chat" on public.club_chat;
create policy "Club adds chat" on public.club_chat for insert to authenticated
  with check (public.can_post_in_club(club_id));
drop policy if exists "Author or coach deletes chat" on public.club_chat;
create policy "Author or coach deletes chat" on public.club_chat for delete to authenticated
  using ((select auth.uid()) = author_id or public.is_club_coach(club_id));

drop policy if exists "Club reads posts" on public.club_posts;
create policy "Club reads posts" on public.club_posts for select to authenticated
  using (public.can_read_club(club_id) and (hidden_at is null or public.is_club_coach(club_id)));
drop policy if exists "Club adds posts" on public.club_posts;
create policy "Club adds posts" on public.club_posts for insert to authenticated
  with check (public.can_post_in_club(club_id));
drop policy if exists "Author or coach deletes posts" on public.club_posts;
create policy "Author or coach deletes posts" on public.club_posts for delete to authenticated
  using ((select auth.uid()) = author_id or public.is_club_coach(club_id));

drop policy if exists "Club reads polls" on public.club_polls;
create policy "Club reads polls" on public.club_polls for select to authenticated
  using (public.can_read_club(club_id) and (hidden_at is null or public.is_club_coach(club_id)));
drop policy if exists "Club adds polls" on public.club_polls;
create policy "Club adds polls" on public.club_polls for insert to authenticated
  with check (public.can_post_in_club(club_id));
drop policy if exists "Author or coach deletes polls" on public.club_polls;
create policy "Author or coach deletes polls" on public.club_polls for delete to authenticated
  using ((select auth.uid()) = author_id or public.is_club_coach(club_id));

drop policy if exists "Club reads results" on public.club_results;
create policy "Club reads results" on public.club_results for select to authenticated
  using (public.can_read_club(club_id));
drop policy if exists "Club adds results" on public.club_results;
create policy "Club adds results" on public.club_results for insert to authenticated
  with check (public.can_post_in_club(club_id));
drop policy if exists "Author or coach deletes results" on public.club_results;
create policy "Author or coach deletes results" on public.club_results for delete to authenticated
  using ((select auth.uid()) = author_id or public.is_club_coach(club_id));

-- Votes: a member sees and changes only their own, while the poll is open (the trigger checks).
drop policy if exists "Own votes" on public.club_poll_votes;
create policy "Own votes" on public.club_poll_votes for select to authenticated
  using ((select auth.uid()) = voter_id);
drop policy if exists "Cast own vote" on public.club_poll_votes;
create policy "Cast own vote" on public.club_poll_votes for insert to authenticated
  with check (public.can_post_in_club(club_id));
drop policy if exists "Change own vote" on public.club_poll_votes;
create policy "Change own vote" on public.club_poll_votes for update to authenticated
  using ((select auth.uid()) = voter_id)
  with check (public.can_post_in_club(club_id));
drop policy if exists "Withdraw own vote" on public.club_poll_votes;
create policy "Withdraw own vote" on public.club_poll_votes for delete to authenticated
  using ((select auth.uid()) = voter_id);

-- Brackets: the club reads, only the coach writes.
drop policy if exists "Club reads brackets" on public.club_brackets;
create policy "Club reads brackets" on public.club_brackets for select to authenticated
  using (public.can_read_club(club_id));
drop policy if exists "Coach manages brackets" on public.club_brackets;
create policy "Coach manages brackets" on public.club_brackets for all to authenticated
  using (public.is_club_coach(club_id))
  with check (public.is_club_coach(club_id));

-- Reports: a member files one; only the coach reads or clears them.
drop policy if exists "Club files reports" on public.club_reports;
create policy "Club files reports" on public.club_reports for insert to authenticated
  with check (public.can_read_club(club_id));
drop policy if exists "Coach reads reports" on public.club_reports;
create policy "Coach reads reports" on public.club_reports for select to authenticated
  using (public.is_club_coach(club_id));
drop policy if exists "Coach clears reports" on public.club_reports;
create policy "Coach clears reports" on public.club_reports for delete to authenticated
  using (public.is_club_coach(club_id) or (select auth.uid()) = reporter_id);

-- Poll totals for a club, without saying who voted for what.
create or replace function public.club_poll_tally(p_club_id uuid)
returns table (poll_id uuid, option_index int, votes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.poll_id, v.option_index, count(*)
  from public.club_poll_votes v
  where v.club_id = p_club_id and public.can_read_club(p_club_id)
  group by v.poll_id, v.option_index;
$$;

-- Friendly prediction standings: how many settled predictions each current member got right.
create or replace function public.club_prediction_standings(p_club_id uuid)
returns table (display_name text, correct bigint, answered bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.display_name,
    count(*) filter (where v.option_index = p.correct_option),
    count(*)
  from public.club_poll_votes v
  join public.club_polls p on p.id = v.poll_id
  join public.club_members m on m.club_id = p.club_id and m.athlete_id = v.voter_id and m.left_at is null
  where p.club_id = p_club_id and p.kind = 'prediction' and p.correct_option is not null and p.hidden_at is null
    and public.can_read_club(p_club_id)
  group by m.athlete_id, m.display_name
  order by 2 desc, 3 asc, 1 asc;
$$;

-- Name the right answer to a prediction (its author or the coach), which also closes it.
create or replace function public.resolve_club_prediction(p_poll_id uuid, p_option int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.club_polls;
begin
  select * into v_poll from public.club_polls where id = p_poll_id;
  if not found or v_poll.kind <> 'prediction' then
    raise exception 'That prediction was not found.' using errcode = 'P0002';
  end if;
  if not (public.is_club_coach(v_poll.club_id) or (v_poll.author_id = auth.uid() and public.can_read_club(v_poll.club_id))) then
    raise exception 'Only the person who made this prediction, or the coach, can settle it.' using errcode = '42501';
  end if;
  if p_option is null or p_option < 0 or p_option >= jsonb_array_length(v_poll.options) then
    raise exception 'Choose one of the options.' using errcode = '22023';
  end if;
  update public.club_polls set correct_option = p_option, closes_at = least(closes_at, now()) where id = p_poll_id;
end;
$$;

-- Close a poll or prediction early (its author or the coach).
create or replace function public.close_club_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.club_polls;
begin
  select * into v_poll from public.club_polls where id = p_poll_id;
  if not found then
    raise exception 'That poll was not found.' using errcode = 'P0002';
  end if;
  if not (public.is_club_coach(v_poll.club_id) or (v_poll.author_id = auth.uid() and public.can_read_club(v_poll.club_id))) then
    raise exception 'Only the person who made this poll, or the coach, can close it.' using errcode = '42501';
  end if;
  update public.club_polls set closes_at = least(closes_at, now()) where id = p_poll_id;
end;
$$;

-- Moderation, coach only: hide or show an item, and mute or unmute a member.
create or replace function public.set_club_item_hidden(p_table text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club uuid;
  v_at timestamptz := case when p_hidden then now() else null end;
begin
  if p_table = 'club_chat' then
    select club_id into v_club from public.club_chat where id = p_id;
  elsif p_table = 'club_posts' then
    select club_id into v_club from public.club_posts where id = p_id;
  elsif p_table = 'club_polls' then
    select club_id into v_club from public.club_polls where id = p_id;
  else
    raise exception 'Unknown item type.' using errcode = '22023';
  end if;
  if v_club is null or not public.is_club_coach(v_club) then
    raise exception 'Only the coach can do that.' using errcode = '42501';
  end if;
  if p_table = 'club_chat' then update public.club_chat set hidden_at = v_at where id = p_id;
  elsif p_table = 'club_posts' then update public.club_posts set hidden_at = v_at where id = p_id;
  else update public.club_polls set hidden_at = v_at where id = p_id;
  end if;
end;
$$;

create or replace function public.set_club_member_muted(p_club_id uuid, p_athlete_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_club_coach(p_club_id) then
    raise exception 'Only the coach can do that.' using errcode = '42501';
  end if;
  update public.club_members set muted = p_muted where club_id = p_club_id and athlete_id = p_athlete_id;
end;
$$;

revoke execute on function public.club_poll_tally(uuid) from public, anon;
revoke execute on function public.club_prediction_standings(uuid) from public, anon;
revoke execute on function public.resolve_club_prediction(uuid, int) from public, anon;
revoke execute on function public.close_club_poll(uuid) from public, anon;
revoke execute on function public.set_club_item_hidden(text, uuid, boolean) from public, anon;
revoke execute on function public.set_club_member_muted(uuid, uuid, boolean) from public, anon;
grant execute on function public.club_poll_tally(uuid) to authenticated;
grant execute on function public.club_prediction_standings(uuid) to authenticated;
grant execute on function public.resolve_club_prediction(uuid, int) to authenticated;
grant execute on function public.close_club_poll(uuid) to authenticated;
grant execute on function public.set_club_item_hidden(text, uuid, boolean) to authenticated;
grant execute on function public.set_club_member_muted(uuid, uuid, boolean) to authenticated;
