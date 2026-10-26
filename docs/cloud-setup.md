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
- Update the app's privacy wording (Home page, README) if you change these defaults.

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

> Keys entered in a browser can be read by anyone using that browser. Use keys with a spending limit, and do not share devices with saved keys.

## 2. Accounts and backup (Supabase)

1. Create a project at https://supabase.com.
2. In **SQL Editor**, run [`supabase/schema.sql`](../supabase/schema.sql). It creates the `athlete_profiles` and `video_reports` tables, a private `videos` storage bucket, and row-level-security policies so each user can only reach their own rows and files.
3. In **Authentication → URL Configuration**, set the Site URL to your deployment (e.g. `https://archerlab-edge.vercel.app`) and add `https://archerlab-edge.vercel.app/profile` (plus `http://localhost:5173/profile` for development) to the redirect URLs.
4. Email sign-in links work out of the box. To add Google sign-in, enable the Google provider in **Authentication → Providers**.
5. Copy the project URL and the **anon** public key from **Project Settings → API** into environment variables (below). The anon key is safe to ship to browsers; row-level security protects the data.

The app talks to Supabase over plain REST (`src/cloud/account/supabaseRest.ts`), so no extra npm package is needed.

The free plan limits single uploads to 50 MB; the app checks this before uploading a video and backs up only the report when a video is larger. Set `VITE_SUPABASE_MAX_UPLOAD_MB` if your project allows more.

## 3. Dropbox and Google Drive import (desktop)

**Dropbox:** create an app at https://www.dropbox.com/developers/apps (Scoped access, App folder or Full Dropbox), add your domain under *Chooser/Saver domains*, and copy the **App key**.

**Google Drive:** in Google Cloud Console, enable the **Google Picker API** and **Google Drive API**, create an **API key** and an **OAuth client ID** (Web application) with your domain as an authorised JavaScript origin, and note the project number (App ID). The app requests the narrow `drive.file` scope, which only grants access to files the athlete picks.

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
