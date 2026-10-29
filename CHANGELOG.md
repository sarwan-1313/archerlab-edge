# Changelog

All notable changes to ArcherLab Edge. Versions follow [semantic versioning](https://semver.org/); while the project is below 1.0, minor versions can change behaviour.

## Unreleased

### Added

- **Practice log** (`/training`), stored on the device. Live sessions and video analyses add an entry automatically (date, arrows, average score when scores were entered, form score and focus areas). Athletes can add their own entries too: distance, target face, arrows, total score, notes and how it felt from 1 to 5. The Training page shows this week's arrows and sessions, streaks, a 26-week heat-map of training days, and charts of arrows per week, average score and form score.
- **Weekly goals**: arrows and sessions per week and a focus area from the latest video analysis, with progress on Home, Profile and Training.
- The practice log is included in the Privacy page's export and delete controls, and in account backup and restore. Existing cloud projects need the latest `supabase/schema.sql` (new `practice_logs` table).

## 0.2.0 (2026-10-29)

A second, offline engine for recorded video, plus privacy controls, optional cloud and on-device AI features, offline use and video conversion; also everything that reached `main` after the 0.1.0 tag (the guided training flow, user guide, sample session and redesign). The live engine's measurements are unchanged.

### Added

- **Guided training flow** for live sessions: readiness check, shot review after each arrow, an end-session dialog and a session summary.
- **User guide**: a ten-step manual from camera setup to analytics, with a deep link for each step (`/guide/camera-setup` and so on).
- **Sample session** for visitors without a camera or bow, generated through the real capture engine.
- **Scroll-driven landing page** and an athletic redesign across the app, including an Analytics scoreboard, a scorecard split into ends and arrow-by-arrow form charts, with self-hosted fonts, page metadata and a social preview image.
- MIT license.
- **Anchor on the face** (experimental). Face Landmarker and Hand Landmarker run on a few frames of each shot's anchor, on a crop around the head, to measure where the index fingertip sits relative to the chin, mouth corner and nose. Two experimental metrics (anchor contact point, anchor consistency on the face) with a finding and drill, confidence that drops when side-on footage hides the draw side of the face, and a face diagram with one dot per shot.
- **Voice notes.** Say the score and what you noticed after a shot; Whisper (whisper-tiny, about 70 MB with its runtime, downloaded once after asking) turns it into text on the device. The score is suggested and confirmed before it is saved; notes show in Replay and in the video report. English, with experimental Hindi and Punjabi. The audio never leaves the device.

- **Video analysis engine** (`src/video-analysis`). Upload a recorded clip from any camera angle. Every frame is tracked on the device, with a precision pass at the clip's native frame rate around each release. Shots are found automatically (release first, then anchor, draw and follow-through), let-downs are rejected, and the camera view and drawing hand are detected.
- **Audio timing.** The sound of each release snaps its time to the millisecond, and clicker and arrow-impact sounds are picked up. Shots that are heard but not tracked are reported as audio-only.
- **Levels and coaching.** A transparent rubric scores six areas and gives an overall form score and an estimated level, both labelled as unvalidated estimates from movement only. Levels are capped when a fundamental fault remains. Reports include the top things to work on (each with a drill and a **Show me** button that jumps the replay to the moment), strengths, a practice plan and links to resources. Results can update a form status on the athlete profile.
- **Frame-by-frame replay** of each clip with a skeleton overlay, a phase timeline and a per-frame readout.
- **Video shots in Analytics and Replay.** **Open in Analytics** runs a clip's pose samples through the live capture engine, so its shots appear alongside live sessions, ready for scores.
- **Re-scoring.** Change the bow type or drawing hand and score a clip again from the movement already tracked, without processing the video again.
- **Report files.** Export a report as JSON, and open an exported report later. It is validated and scored again with the current engine.
- **Real-clip fixtures.** Exported reports with an `expected` block in `src/video-analysis/fixtures/` become regression tests.
- **Larger pose models.** The Full and Heavy MediaPipe models are downloaded automatically on Vercel builds (pinned to version 1; a failed download does not fail the build). Video analysis preselects Full when it is available.
- **Trimming.** A chosen video is previewed first, and the athlete picks the start and end of the part to analyse. The 15-minute limit applies to the selection, not the file. Only the selection is tracked, and sounds outside it are ignored.
- **Screen wake lock** during analysis, where the browser supports it.
- **Privacy page** (`/privacy`): what runs on the device, what is stored, what each optional feature sends and to whom, and a note on young athletes. It has controls to export all video reports, delete video analyses, or delete everything the app stores on the device. Signed-in athletes can delete their cloud data or their account.
- **Optional AI review.** A second opinion from Claude, GPT and/or Gemini, using the athlete's own API keys, after an explicit consent tick. Six annotated stills plus the measurements are sent by default; the whole clip goes to Gemini only as a separate opt-in. The coaches' views are combined to show where they agree.
- **Optional accounts and backup** (Supabase over plain REST): back up the profile and video reports, and optionally videos, with row-level security. Includes a `delete_my_account()` SQL function for self-service account deletion.
- **Optional imports** from Dropbox and Google Drive on desktop, and from a link.
- `CHANGELOG.md`.
- **Installable and offline.** A service worker keeps the app, its fonts, the MediaPipe runtime and the Lite, hand and face models, so Live and Video Analysis work with no connection; larger downloads (Full and Heavy pose models, the converter, the voice-note runtime, the private coach) are kept after first use. A new version waits for the athlete's **Reload** and never interrupts an analysis. An offline badge shows when there is no connection.
- **Convert to MP4 on this device.** A clip the browser cannot play (typically an iPhone HEVC `.mov`) can be converted to a 720 px H.264 MP4 with ffmpeg compiled to WebAssembly, with progress, an estimate of the time left and Cancel. The converter (about 31 MB, GPL-2.0-or-later, self-hosted, see `public/ffmpeg/NOTICE.txt`) is downloaded only when asked for. The video is never uploaded.
- **Remote coach review** (optional, needs accounts). A signed-in athlete can share a video report read-only with a coach's email from **Share with a coach** in the report. The report is backed up first if needed. The video is included only if the athlete ticks it (off by default), and sharing asks them to confirm they trust the coach (and, if under 18, to ask a parent or guardian first). Shares are listed with **Revoke**, and the athlete copies a `/video?report=<id>` link to send the coach themselves; the app sends no email.
- **Shared with me** on the Video Analysis page for signed-in coaches. Opening a shared link loads the report from the cloud, with the video through a short-lived signed URL when it was included.
- **Comments** on reports in the cloud, from the athlete and their coaches, showing author, shot and time. **Comment at this moment** uses the replay's current time and shot, clicking a comment jumps the replay there, and timed comments are marked on the timeline. Authors can delete their own comments.
- `report_shares` and `report_comments` tables in `supabase/schema.sql`, with row-level security: coaches can read, never edit or delete, a shared report; they can read its video only when it is included; and only the owner and active coaches can read and add comments. Re-run the script to add them to an existing project.
- **3D view** tab next to the replay in the video report. It draws the report's world landmarks (metres, hip-centred) as a skeleton with the bow arm in cyan and the draw arm in orange, a floor grid and an arrow line from the draw hand to the bow hand. It follows the replay time and the frame-step buttons, orbits by drag and zoom, and has Side, Behind and Top-down cameras. three.js is loaded only when the tab is first opened, and its WebGL resources are freed when the tab closes. Camera moves are not animated when the system asks for reduced motion. Reports restored from the cloud have no landmarks, so the tab says so instead. It shows measured landmarks only, not a prediction.
- **Private coach.** An optional on-device AI coach in the video report (WebLLM, Qwen2.5-1.5B-Instruct, Apache-2.0). It is offered only where WebGPU works, shows the model's size and asks before the one-time 886 MB download, then reviews the measurements and answers follow-up questions about the report. Nothing is sent anywhere. It counts in the combined consensus, has a Stop button, and frees graphics memory when the report is left. The Privacy page describes it, and "Delete everything" removes the saved model.
- **Coach tools** setting (Profile, off by default) and **Label this clip** in video reports: correct each release frame by frame, mark false shots, missed shots and let-downs, rate six areas 1–5 per shot and give a level. Labels are saved with the report and kept when it is scored again.
- **Export as fixture**: the landmarks, sound onsets and an `expected` block from the labels, never the video or images.
- `npm run validate:fixtures`: shot-detection precision and recall, release-timing error, Spearman correlation between area scores and coach ratings, and level agreement. Fails only when detection falls below the stored baseline. `docs/validation.md` covers consent, how many clips are useful and how to tune the rubric.
- **End-to-end tests** with Playwright and axe accessibility checks on desktop and phone sizes, using a stubbed pose model and a synthetic clip (`npm run test:e2e`).

### Changed

- The cloud backup list and cloud report deletion now ask only for the athlete's own reports, since reports shared with them are readable too.
- **Delete my cloud data** also deletes the comments the athlete wrote on reports shared with them. Shares and comments on their own reports go with the reports, and with the account.
- The Privacy page, README and `docs/cloud-setup.md` explain sharing, what a coach can see, how to revoke, and what deletion removes.
- Every page, including Live Analysis, is loaded on demand; MediaPipe, three.js, Transformers.js, WebLLM and ffmpeg each load only when their feature is used, and the private coach's WebLLM code (about 6 MB) runs only inside its worker, is never loaded by the page and is not part of the app install. No build chunk is over 500 kB.
- Video analysis reports state their limits, including trimmed ranges and audio that could not be used. Files longer than 30 minutes are analysed without their sound.
- The README, `docs/video-analysis.md` and `docs/cloud-setup.md` cover the new engine and the optional features. All cloud features are off by default and appear only when a deployment configures them.
- Development moved to GitHub Codespaces, with Vercel deploying production from `main`.

### Fixed

- Re-scoring a video report no longer drops the athlete's shot notes.
- Refreshing or opening a deep link such as `/guide/camera-setup` on Vercel no longer returns a 404.
- Camera start-up, profile saving and the recording lifecycle are more reliable, and recording no longer loses telemetry silently.

## 0.1.0 (2026-08-17)

The live analysis prototype.

- On-device pose tracking with MediaPipe Pose Landmarker (WebAssembly, self-hosted models), with skeleton overlay and quality gating.
- A biomechanics engine for shoulder line, bow-arm angle, torso lean, head and bow-hand stability, smoothed over time and normalised by shoulder width.
- Shot-cycle capture around a manual release (automatic release detection is experimental), with draw, hold, release and follow-through phases and release metrics.
- Touchless score entry by hand gesture, with manual and on-target entry as fallbacks.
- Local session recording with synchronised telemetry, a Sessions library and replay.
- Performance analytics: totals, a target plot of where arrows landed, consistency statistics and a descriptive comparison of high- and low-scoring arrows.
- An explicitly experimental shot-distribution simulator.
- Camera calibration, a gesture guide, an athlete profile and an experimental multi-camera view.
