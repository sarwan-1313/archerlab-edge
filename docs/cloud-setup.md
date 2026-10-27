# Optional cloud features

ArcherLab Edge works fully on-device with no setup. Three optional features can be switched on. All are **off by default**, and none sends anything anywhere until the athlete chooses to.

| Feature | Needs | Who pays |
| --- | --- | --- |
| AI coach second opinion (Claude, GPT, Gemini) | Nothing to deploy. Each athlete pastes their own API key in the report | The key's owner, per review |
| Accounts and backup (profile, video reports, videos) | A free Supabase project + 2 environment variables | Supabase free tier is enough to start |
| Import from Dropbox / Google Drive on desktop | An app key from Dropbox and/or Google | Free |

On phones, the normal **Choose video** button already opens Google Drive, iCloud, Dropbox and other storage apps through the system file picker, with no setup.

## Privacy and young athletes

Many ArcherLab users are under 18. Before turning cloud features on for a club or school:

- The AI coach panel requires an explicit consent tick ("a parent or guardian has agreed") before anything is sent. By default it sends **six annotated still frames plus the measurements**, not the video. Gemini can be allowed to watch the whole clip (under 14 MB), as a separate opt-in.
- API keys stay in the browser (session storage, or local storage if "remember" is ticked) and go only to the chosen provider. ArcherLab has no server.
- Account backup stores reports **without** per-frame landmarks. Videos are uploaded only when the athlete presses "Back up report + video". Row-level security keeps every row and file private to its owner.
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
2. In **SQL Editor**, run [`supabase/schema.sql`](../supabase/schema.sql). It creates the `athlete_profiles` and `video_reports` tables, a private `videos` storage bucket, row-level-security policies so each user can only reach their own rows and files, and the `delete_my_account()` function (see [Deleting cloud data and accounts](#deleting-cloud-data-and-accounts)). The script is safe to run again, for example to add the function to an existing project.
3. In **Authentication → URL Configuration**, set the Site URL to your deployment (e.g. `https://archerlab-edge.vercel.app`) and add `https://archerlab-edge.vercel.app/profile` (plus `http://localhost:5173/profile` for development) to the redirect URLs.
4. Email sign-in links work out of the box. To add Google sign-in, enable the Google provider in **Authentication → Providers**.
5. Copy the project URL and the **anon** public key from **Project Settings → API** into environment variables (below). The anon key is safe to ship to browsers; row-level security protects the data.

The app talks to Supabase over plain REST (`src/cloud/account/supabaseRest.ts`), so no extra npm package is needed.

The free plan limits single uploads to 50 MB; the app checks this before uploading a video and backs up only the report when a video is larger. Set `VITE_SUPABASE_MAX_UPLOAD_MB` if your project allows more.

### Deleting cloud data and accounts

Signed-in athletes can remove their data themselves from the Privacy page:

- **Delete my cloud data** lists the athlete's own folder in the `videos` bucket (`<user id>/…`) and deletes every file in it, plus any file a report row points to. It then deletes all of their `video_reports` rows and their `athlete_profiles` row. The account stays. Row-level security limits every request to the athlete's own rows and files.
- **Delete my account** does the same, then calls `POST /rest/v1/rpc/delete_my_account`, then signs out. Storage files are deleted first because stored objects can keep a user from being deleted.

`delete_my_account()` is a `security definer` SQL function that runs `delete from auth.users where id = auth.uid()`, so it can only ever delete the caller. Its `search_path` is empty and every name is schema-qualified. Execution is revoked from `public` and `anon` and granted only to `authenticated`. Deleting the user cascades to their rows in `athlete_profiles` and `video_reports`.

If a project was set up before this function existed, **Delete my account** still deletes the athlete's cloud data, then reports that the account could not be removed. Re-run `supabase/schema.sql` to add the function.

## 3. Dropbox and Google Drive import (desktop)

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
| `VITE_GOOGLE_CLIENT_ID` | Google Drive import |
| `VITE_GOOGLE_APP_ID` | Google Drive import (project number) |

With none set, the cloud features stay hidden and the app is fully on-device.

## Not included: server-side video processing

Analysing video on a server (for very long or very large files) would need a paid backend with GPUs, a job queue and storage, and would mean sending athletes' videos off their device by default. The browser engine already streams long clips frame by frame without holding the video in memory, so this has been left out on purpose. If it is ever needed, the pure engine (`src/video-analysis/buildReport.ts`) can run unchanged on a server once landmarks are produced there.
