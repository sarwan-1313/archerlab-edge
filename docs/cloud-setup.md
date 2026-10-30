# Optional cloud features

ArcherLab Edge works fully on-device with no setup. Four optional features can be switched on. All are **off by default**, and none sends anything anywhere until the athlete chooses to.

| Feature | Needs | Who pays |
| --- | --- | --- |
| AI coach second opinion (Claude, GPT, Gemini) | Nothing to deploy. Each athlete pastes their own API key in the report | The key's owner, per review |
| Save to the athlete's own Google Drive (profile, practice log, settings, video reports, videos on request) | A Google OAuth client ID + 1 environment variable | Free; the data uses the athlete's own Drive storage |
| Accounts (Google or email sign-in with a small profile), sharing a report with a coach, clubs | A free Supabase project + 2 environment variables | Supabase free tier is enough to start |
| Import from Dropbox / Google Drive on desktop | An app key from Dropbox and/or Google | Free |

On phones, the normal **Choose video** button already opens Google Drive, iCloud, Dropbox and other storage apps through the system file picker, with no setup.

## Privacy and young athletes

Many ArcherLab users are under 18. Before turning cloud features on for a club or school:

- The AI coach panel requires an explicit consent tick ("a parent or guardian has agreed") before anything is sent. By default it sends **six annotated still frames plus the measurements**, not the video. Gemini can be allowed to watch the whole clip (under 14 MB), as a separate opt-in.
- API keys stay in the browser (session storage, or local storage if "remember" is ticked) and go only to the chosen provider. ArcherLab has no server.
- Account backup stores reports **without** per-frame landmarks. Videos are uploaded only when the athlete presses "Back up report + video". Row-level security keeps every row and file private to its owner, except what the athlete shares read-only with a coach or a club (see [Remote coach review](#remote-coach-review) and [Clubs](#clubs)).
- Joining a [club](#clubs) asks for the athlete's age. Under 18 needs an "A parent or guardian has agreed" tick, enforced again in the database, and a minor's email is never stored on the membership, so the coach sees only the display name they chose. Sharing reports and the practice log with the club is off until the athlete turns it on.
- Sharing with a coach asks the athlete to confirm "Only share with a coach you trust. If you're under 18, ask a parent or guardian first." The video is never shared unless the athlete ticks "Include the video".
- The in-app **Privacy** page (`/privacy`, `src/pages/PrivacyPage.tsx`) explains all of this to athletes and lets them export or delete their data. Update it, and the README, if you change these defaults.

## 1. AI coaches

Nothing to configure. In a report, open **Second opinion from AI coaches**, enable one or more providers, paste a key and press **Ask coaches**.

| Provider | Default model | Get a key |
| --- | --- | --- |
| Claude (Anthropic) | `claude-sonnet-5-5` | https://platform.claude.com/ |
| GPT (OpenAI) | `gpt-5.6` | https://platform.openai.com/api-keys |
| Gemini (Google) | `gemini-3.8-flash` | https://aistudio.google.com/apikey |

The model field is editable, so newer models can be used without a code change. Requests are made directly from the browser:

- Claude: `POST https://api.anthropic.com/v1/messages` with `anthropic-version: 2026-10-21` and `anthropic-dangerous-direct-browser-access: true`.
- OpenAI: `POST https://api.openai.com/v1/chat/completions` with JSON output.
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with JSON output.

Each model answers as a coach in a fixed JSON shape; the app shows each review and a combined view (level vote including ArcherLab's own estimate, and advice that several coaches agree on).

The default models think before they answer, and that thinking counts toward the output limit, so each request allows 8,000 output tokens (8,192 for Gemini). The app reads each provider's stop reason (`stop_reason`, `finish_reason`, `finishReason` / `promptFeedback.blockReason`) and says plainly when a review was cut off by the limit, declined, or blocked for safety, instead of failing to read it.

> Keys entered in a browser can be read by anyone using that browser. Use keys with a spending limit, and do not share devices with saved keys.

## 2. Accounts and backup (Supabase)

1. Create a project at https://supabase.com.
2. In **SQL Editor**, run [`supabase/schema.sql`](../supabase/schema.sql). It creates the `athlete_profiles`, `practice_logs` and `video_reports` tables, a private `videos` storage bucket, row-level-security policies so each user can only reach their own rows and files, the `report_shares` and `report_comments` tables for [remote coach review](#remote-coach-review), the `clubs`, `club_members` and `club_invites` tables for [clubs](#clubs), and the `delete_my_account()` function (see [Deleting cloud data and accounts](#deleting-cloud-data-and-accounts)). The script is safe to run again, for example to add coach review, the practice log or clubs to an existing project. Until it is re-run, **Back up profile & log** on an older project reports that the practice log table is missing.
3. In **Authentication → URL Configuration**, set the Site URL to your deployment (e.g. `https://archerlab-edge.vercel.app`) and add `https://archerlab-edge.vercel.app/profile` (plus `http://localhost:5173/profile` for development) to the redirect URLs.
4. Email sign-in links work out of the box. To add Google sign-in (the main button on the Profile page), enable the Google provider in **Authentication → Providers** and paste in an OAuth client ID and secret from Google Cloud (a Web application client whose authorised redirect URI is `https://<project>.supabase.co/auth/v1/callback`). It can be the same client as Drive saving. Coach review trusts the email in each user's sign-in token, so leave **Confirm email** switched on if you also enable password sign-up.
5. Copy the project URL and the **anon** public key from **Project Settings → API** into environment variables (below). The anon key is safe to ship to browsers; row-level security protects the data.

The app talks to Supabase over plain REST (`src/cloud/account/supabaseRest.ts`), so no extra npm package is needed.

The free plan limits single uploads to 50 MB; the app checks this before uploading a video and backs up only the report when a video is larger. Set `VITE_SUPABASE_MAX_UPLOAD_MB` if your project allows more.

### Remote coach review

A signed-in athlete can share one report with a coach, who reviews it from anywhere. All of it appears only when accounts are configured and the athlete is signed in.

- **Sharing.** In a report, **Share with a coach** backs the report up first if it is not in the account yet (and uploads the video if the athlete ticks **Include the video**, which is off by default). The athlete enters the coach's email and confirms they trust the coach. This adds a row to `report_shares` (stored in lower case, one per report and coach). Sharing again with the same coach updates the share and restores it if it was revoked.
- **The link.** The app sends no email. The athlete copies `/video?report=<id>` and sends it to the coach themselves. The link only works for a coach who signs in with the email it was shared with. Shared reports also appear under **Shared with me** on the coach's Video Analysis page.
- **What the coach sees.** The report row as backed up (scores, findings, shot timings, file name; no per-frame landmarks), the athlete's email, and the comments. The video only when the share includes it: the app then asks Storage for a signed URL, which lasts an hour. Coaches can never update or delete the report, re-share it, or run the AI review on it.
- **Comments.** The athlete and every active coach can read and add comments (`report_comments`, 1–2000 characters). **Comment at this moment** stores the replay's current time and the shot it falls in; clicking a comment jumps the replay there, and timed comments are marked on the timeline. Authors can delete their own comments; there is no editing.
- **Revoking.** **Revoke** next to a coach sets `revoked_at`. The coach loses access to the report, its comments and its video at once; a signed video URL they already opened keeps working until it expires (up to an hour). Comments they wrote stay with the report.

How the policies enforce this (each one is commented in `schema.sql`):

| Who | Can |
| --- | --- |
| Athlete (owner) | Create shares only for reports they own, under their own id and email; read, revoke and delete their own shares |
| Coach | Read active shares where `coach_email = lower(auth.jwt() ->> 'email')`; read the shared `video_reports` row (select only); read the video file only when `include_video` is true on an active share |
| Owner and active coaches | Read and add comments on the report, as themselves (`author_id = auth.uid()`, `author_email` from the token) |
| Comment author | Delete their own comments |

The policies call three small `security definer` functions (`owns_video_report`, `is_report_coach`, `can_read_shared_video`). They answer only yes/no questions about the caller, and they let the `video_reports` and `report_shares` policies check each other without recursing.

### Clubs

Clubs extend coach review so one volunteer coach can follow everyone at a training ground. Everything is on the **My club** page (`/club`, linked from the account panel on Profile).

- **Starting a club.** Any signed-in user can create a club (`clubs`, one row per club with `coach_id = auth.uid()`) and make invite codes (`club_invites`: 8 characters without 0/O or 1/I, an expiry of up to 90 days and 1–500 uses). The app sends nothing: the coach hands codes out.
- **Joining.** The athlete enters the code and the name the coach will see, says whether they are under 18, reads what the coach will see, and confirms. Under 18 also needs a parent or guardian's agreement. The app calls `join_club(code, display_name, is_minor, guardian_confirmed)`, which checks the code's expiry and uses, refuses a minor without the agreement, stores the sign-in email only for adults, and counts the use. Rejoining after leaving starts again with sharing off.
- **Sharing.** Each membership has `share_analyses` ("Share my analyses with my club") and `share_practice_log` ("Share my practice log with my club"), both false by default and changed only through `set_club_sharing`. While `share_analyses` is on, the coach can read the athlete's backed-up `video_reports` rows (never the video file) and comment on them. While `share_practice_log` is on, the coach can read their `practice_logs` row.
- **What the coach sees.** For each current member: the display name, the email for adults only, an estimated level and form-score trend from shared reports, arrows and sessions per week from a shared practice log, and the focus area named most often across the latest shared report of each athlete. Opening a report reuses the coach review page, read-only and without the video.
- **Minors.** A check constraint keeps `athlete_email` null whenever `is_minor` is true. Club coaches read comments through `club_report_comments(report_id)`, which leaves out the email of any author who is a minor member of one of their clubs, and the app shows the athlete by display name.
- **Leaving.** `leave_club` sets `left_at` and turns both switches off. The coach stops seeing the athlete, their reports and their log at once; comments already written stay on the reports.

| Who | Can |
| --- | --- |
| Coach | Create, read, rename and delete their own clubs; create, read and delete their clubs' invites; read current members of their clubs; read (select only) the reports and practice logs of members whose switches are on; comment on those reports |
| Athlete | Read the clubs they are a current member of (not other members) and their own membership rows; join, change sharing and leave only through `join_club`, `set_club_sharing` and `leave_club`; delete their own membership rows |
| Nobody | Insert or update `club_members` directly, so an athlete cannot change their club, age flag or email, and a coach cannot change an athlete's sharing |

The policies use `security definer` helpers (`is_club_coach`, `is_club_member`, `club_shares_analyses`, `club_shares_practice_log`, `is_club_report_coach`) that answer yes/no questions about the caller, like the coach review ones. The "Add report comments" policy is replaced to also allow club coaches.

### Deleting cloud data and accounts

Signed-in athletes can remove their data themselves from the Privacy page:

- **Delete my cloud data** lists the athlete's own folder in the `videos` bucket (`<user id>/…`) and deletes every file in it, plus any file a report row points to. It then deletes the comments they wrote on reports shared with them, all of their `video_reports` rows (which removes every share of those reports and every comment on them) their `athlete_profiles` row and their `practice_logs` row, their `club_members` rows and any club they coach (with its memberships and invites). The account stays. Row-level security limits every request to the athlete's own rows and files.
- **Delete my account** does the same, then calls `POST /rest/v1/rpc/delete_my_account`, then signs out. Storage files are deleted first because stored objects can keep a user from being deleted.

`delete_my_account()` is a `security definer` SQL function that runs `delete from auth.users where id = auth.uid()`, so it can only ever delete the caller. Its `search_path` is empty and every name is schema-qualified. Execution is revoked from `public` and `anon` and granted only to `authenticated`. Deleting the user cascades to their rows in `athlete_profiles`, `practice_logs` and `video_reports`, and from there to every share and comment on their reports, as well as to shares they created and comments they wrote anywhere.

If a project was set up before this function existed, **Delete my account** still deletes the athlete's cloud data, then reports that the account could not be removed. Re-run `supabase/schema.sql` to add the function.

## 3. Save to the athlete's own Google Drive

With `VITE_GOOGLE_CLIENT_ID` set, the Profile page offers **Connect Google Drive**. The athlete's data goes straight from the browser to an **ArcherLab Edge** folder in *their* Google Drive; nothing passes through or is stored on your servers:

| File | Holds |
| --- | --- |
| `archerlab-backup.json` | Profile (without the photo), practice log and goals, a few app settings (never AI keys or sign-ins) |
| `report-<id>.json.gz` | One video report with its tracked body positions, gzip-compressed |
| `video-<id>.mp4` | A video, only when the athlete presses **Save video to Drive** |

While connected, changes save about 8 seconds after they happen. Connecting on a new device restores first (the practice log is merged, a newer profile wins, reports already on the device are kept) and then saves. A save never removes practice log entries that are already in Drive; **Delete my data from Google Drive** on the Privacy page removes the folder.

Setup, in Google Cloud Console:

1. Enable the **Google Drive API**.
2. **APIs & Services → OAuth consent screen**: add the `…/auth/drive.file` scope. It is a non-sensitive scope, so publishing the app does not need Google's security review; while the app is in *Testing*, only listed test users can connect.
3. **Credentials → Create credentials → OAuth client ID** (Web application). Add every origin the app is served from (e.g. `https://archerlab-edge.vercel.app`, `http://localhost:5173`) as an **Authorised JavaScript origin**. Vercel preview URLs change per deployment, so test on a fixed domain or add the preview origin you use.
4. Set `VITE_GOOGLE_CLIENT_ID` to the client ID. The same client ID is used for the desktop Drive import picker below.

`drive.file` lets the app reach only the files it created (and files the athlete picks in the import picker), never the rest of their Drive. Google's access token lasts about an hour and is kept only in memory, so the athlete taps **Reconnect Google Drive** after that; changes made meanwhile save on reconnect.

When Drive saving is available, the Supabase account keeps **only the sign-in and a small profile** (display name, hand, bow type, discipline, experience level and the estimated level), updated when the athlete saves their profile. The account's practice log and report backup buttons are hidden. Sharing a report with a coach still copies that one report into the account, because the coach reads it there. Clubs that read members' shared analyses or practice logs need those copies too: set `VITE_ACCOUNT_DATA_BACKUP=on` to bring the account backup buttons back alongside Drive.

## 4. Dropbox and Google Drive import (desktop)

**Dropbox:** create an app at https://www.dropbox.com/developers/apps (Scoped access, App folder or Full Dropbox), add your domain under *Chooser/Saver domains*, and copy the **App key**.

**Google Drive:** in Google Cloud Console, enable the **Google Picker API** and **Google Drive API**, create an **API key** and an **OAuth client ID** (Web application) with your domain as an authorised JavaScript origin, and note the project number (App ID). The app requests the narrow `drive.file` scope, which only grants access to files the athlete picks.

Imported files are downloaded into the browser and held in memory until they are analysed, so imports over 2 GB are refused (before downloading when the size is known, and as soon as the download passes 2 GB otherwise).

## Environment variables

Copy `.env.example` to `.env.local` for development, and add the same variables in **Vercel → Project → Settings → Environment Variables** for deployments.

| Variable | Feature |
| --- | --- |
| `VITE_SUPABASE_URL` | Accounts and backup |
| `VITE_SUPABASE_ANON_KEY` | Accounts and backup |
| `VITE_SUPABASE_VIDEO_BUCKET` | Optional, defaults to `videos` |
| `VITE_SUPABASE_MAX_UPLOAD_MB` | Optional, defaults to `50` |
| `VITE_DROPBOX_APP_KEY` | Dropbox import |
| `VITE_GOOGLE_API_KEY` | Google Drive import |
| `VITE_GOOGLE_CLIENT_ID` | Save to Google Drive, and Google Drive import |
| `VITE_ACCOUNT_DATA_BACKUP` | Optional. `on` keeps practice log and report backup in the account as well as Drive |
| `VITE_GOOGLE_APP_ID` | Google Drive import (project number) |

With none set, the cloud features stay hidden and the app is fully on-device.

## Not included: server-side video processing

Analysing video on a server (for very long or very large files) would need a paid backend with GPUs, a job queue and storage, and would mean sending athletes' videos off their device by default. The browser engine already streams long clips frame by frame without holding the video in memory, so this has been left out on purpose. If it is ever needed, the pure engine (`src/video-analysis/buildReport.ts`) can run unchanged on a server once landmarks are produced there.
