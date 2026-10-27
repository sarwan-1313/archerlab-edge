# Changelog

All notable changes to ArcherLab Edge. Versions follow [semantic versioning](https://semver.org/); while the project is below 1.0, minor versions can change behaviour.

## 0.2.0 (2026-10-26)

A second, offline engine for recorded video, plus privacy controls and optional cloud features; also everything that reached `main` after the 0.1.0 tag (the guided training flow, user guide, sample session and redesign). The live engine's measurements are unchanged.

### Added

- **Guided training flow** for live sessions: readiness check, shot review after each arrow, an end-session dialog and a session summary.
- **User guide**: a ten-step manual from camera setup to analytics, with a deep link for each step (`/guide/camera-setup` and so on).
- **Sample session** for visitors without a camera or bow, generated through the real capture engine.
- **Scroll-driven landing page** and an athletic redesign across the app, including an Analytics scoreboard, a scorecard split into ends and arrow-by-arrow form charts, with self-hosted fonts, page metadata and a social preview image.
- MIT license.

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

### Changed

- Video analysis reports state their limits, including trimmed ranges and audio that could not be used. Files longer than 30 minutes are analysed without their sound.
- The README, `docs/video-analysis.md` and `docs/cloud-setup.md` cover the new engine and the optional features. All cloud features are off by default and appear only when a deployment configures them.
- Development moved to GitHub Codespaces, with Vercel deploying production from `main`.

### Fixed

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
