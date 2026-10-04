# ArcherLab Edge UI repair pass — 2 October 2026

The current workspace was audited before application edits. Existing uncommitted work was preserved. The baseline was 100 passing tests across 23 files. This pass ends with 114 passing tests across 28 files, a successful production build, and a clean `git diff --check`.

## Root causes and repairs

| Surface | Finding | Repair |
| --- | --- | --- |
| Welcome → Camera Setup | React development effect replay issued two camera requests. A late permission response could attach a stream after leaving the page. | Share pending requests, reject obsolete device responses, stop unwanted tracks, and use the video track's real device ID. Browser verification now measures one request, one history entry, and one transition per Start action. |
| Welcome | Two secondary introductory actions competed; the progress copy implied historical comparisons beyond the current analytics surface. | Keep Start Analysis and User Guide; quick-start replay remains in Guide. Describe analytics as reviewing captured shots. |
| Camera/setup | Retry could be pressed during camera acquisition; model failure did not expose the setup retry control; idle analysis could be labelled as loading. | Disable pending camera controls, expose recovery for model failure, and distinguish waiting for a camera from actual model loading. |
| Live controls | Preview quality only changed a label; Switch restarted the sole camera; an optional gesture Undo callback did nothing. | Remove the unsupported resolution selector and show observed video resolution. Disable Switch with fewer than two devices. Omit Undo when no handler exists. Add a synchronous Start Session guard and rejected-start feedback. |
| Session ending | Recording failure held the ending state on an artificial 1.2-second timer. | Show the existing failure/summary outcome directly from recorder state. |
| Recording review | A 100 ms timer guessed when video metadata was ready. Opening could finish after navigation; URLs were leaked; an empty recording appeared playable. | Seek on metadata readiness, show real opening state, discard obsolete requests, revoke URLs on replacement/unmount, reject empty video, and explain playback failure. |
| Recording markers | Seeking before a marker made Next seek to that same marker again. | Use the existing pre-roll offset consistently for navigation and disabled states. Give timeline controls accessible names. |
| Missing measurements | Null pose confidence rendered as `0%`; telemetry could appear before its first timestamp. | Render unavailable values without units and wait until telemetry actually applies. Calculations are unchanged. |
| Analytics refresh | Shot state was restored only on `/analysis`, so refreshing `/analytics` or replay lost the available view. | Restore the existing tab session snapshot on every route and persist subsequent result edits. No recording schema changes. |
| Manual score entry | A selected keypad result could not be saved without also placing a target point. Empty direct routes still offered unsaveable controls. | Enable score-only confirmation through the existing scoring function; offer Back when no shot exists. Add keyboard target placement and selected-score semantics. |
| Legacy setup | Session name, a fabricated athlete selector, bow/environment/orientation controls accepted input that was never used. | Remove these controls; retain the four settings consumed by the workflow. |
| Multi-camera | Static photos, latency, FPS, and synchronization statuses impersonated working camera feeds. | Replace them with an honest availability explanation. No pairing functionality was invented. |
| Profile | Save/upload/remove could reject silently. Saving fields omitted the stored photo. | Add pending, success, and retryable error feedback; preserve the existing photo; disable removal when no photo exists. |
| Lazy routes | A rejected lazy import could take down the route without recovery. | Add a route-local error boundary with Reload while preserving shell navigation. |
| Accessibility | End Session lacked keyboard focus containment, Escape, and focus restoration. | Add those behaviors and scroll locking. Keep existing onboarding focus handling and reduced-motion rules. |
| Responsive layout | Legacy calibration content overflowed at 768 px. | Let its grid children and text shrink; allow its action row to wrap. Align shared entry offsets to 6 px / 0.99 scale. |

## Runtime verification

Development server: `http://127.0.0.1:5174/` (5173 was already occupied).

An isolated headless Chrome profile was used through CDP. The browser received synthetic camera video; it did not access the user's normal browser profile or stored recordings. Browser automation exercised actual rendered controls, with screenshots inspected for desktop Home, mobile Home, and mobile Guide.

- Home: first visit, onboarding dismissal, refresh, Start, repeated Start, Guide, navigation, return Home, scroll reset, Back/Forward, and pending-transition cancellation.
- Loading: throttled a lazy page request; observed route-local loading, zero Home/fullscreen loader frames, and zero blank frames in the Welcome audit.
- Guide: all ten entries, semantic link activation, keyboard Enter, Previous, Next, Back to Guide, browser Back/Forward, detail refresh, and responsive contents navigation. Existing guide wiring worked and was retained.
- Camera: real local model files initialized against synthetic video. No athlete correctly blocked readiness. Injected permission denial displayed actionable feedback; retry and restored permission worked.
- Sessions: created real MediaRecorder video in the disposable profile, opened and closed replay, inspected missing telemetry, and checked storage-denial/retry/recovery. Unit regressions cover marker navigation, empty video, and late-open cleanup.
- Full workflow: a **test-only pose-hook response** supplied synthetic landmarks in the browser. Camera, biomechanics, shot capture, recording, score entry, navigation, and storage implementations remained real. Exercised Camera Setup → Readiness → Back → Readiness → Start Session → Live → Pause/Resume → Mark release → manual score → review details → Continue → End dialog/Escape → End → Summary → Home → Sessions/replay → Analytics → shot replay → edited score → Analytics refresh → Guide/detail → Home → Back/Forward.
- Responsive: 390, 430, 768, 1024, and 1440 px. No horizontal overflow in the final general-surface audit or the populated workflow audit (readiness, live, shot review, summary, analytics, biomechanics replay).
- Console: no application exceptions in final browser runs. Existing MediaPipe/OpenGL/TensorFlow diagnostics remain visible; they were not suppressed.

## Validation

| Check | Result |
| --- | --- |
| `npm run build` (invoked as `npm.cmd` under PowerShell) | Passed |
| `npm test` | 114 passed; 28 files passed |
| Existing baseline tests | All 100 retained and passing |
| New regression tests | 14 |
| `git diff --check` | Passed; Git's LF/CRLF notices are informational |
| Welcome browser audit | Passed; one camera request per setup entry |
| Guide browser audit | Ten entries and navigation checks passed |
| General and populated workflow layouts | No horizontal overflow at all five widths |
| Permission/storage recovery browser audit | Passed |

New tests cover camera effect replay, late permissions, device races, permission recovery, dialog keyboard behavior, recording metadata/markers, unavailable telemetry, cleanup, empty recordings, keypad-only scoring, missing-shot recovery, lazy-route errors, Analytics restoration, profile-photo preservation, and failed profile saves.

## Files changed by this pass

Application files:

- `src/App.tsx`
- `src/hooks/useLocalCamera.ts`
- `src/pages/HomePage.tsx`
- `src/pages/LiveAnalysisPage.tsx`
- `src/pages/CalibrationPage.tsx`
- `src/pages/SavedRecordingsPage.tsx`
- `src/pages/ManualShotEntryPage.tsx`
- `src/pages/NewSessionPage.tsx`
- `src/pages/MultiCameraPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/components/RouteLoadingBoundary.tsx`
- `src/components/gestures/GestureScoreOverlay.tsx`
- `src/components/training/EndSessionDialog.tsx`
- `src/components/training/ReadinessCheck.tsx`
- `src/components/training/ShotReviewPanel.tsx`
- `src/index.css`

Regression and audit files:

- `src/App.welcome.test.tsx`
- `src/hooks/useLocalCamera.test.ts`
- `src/components/RouteLoadingBoundary.test.tsx`
- `src/components/training/EndSessionDialog.test.tsx`
- `src/pages/SavedRecordingsPage.test.tsx`
- `src/pages/ManualShotEntryPage.test.tsx`
- `src/pages/ProfilePage.test.tsx`
- `browser-welcome-check.mjs`
- `browser-deep-check.mjs`
- `browser-workflow-check.mjs`
- `browser-error-check.mjs`
- This report

Raw reports and screenshots are in `node_modules/.welcome-audit`, `node_modules/.deep-audit`, `node_modules/.workflow-audit`, and `node_modules/.error-audit`. The guide audit output is `node_modules/deep-guide-final.json`; final test/build logs are `node_modules/deep-tests-final.txt` and `node_modules/deep-build-final.txt`.

## Limits and remaining validation

- Physical camera permission prompts, unplug/reconnect behavior, and a real athlete's complete training session still need hands-on verification. The synthetic workflow is evidence for UI integration, not detection accuracy or hardware certification.
- Mobile testing used desktop Chromium viewport emulation, not physical iOS/Android devices.
- Analytics remains based on the existing current-tab shot snapshot. This pass does not introduce historical cross-session analytics or change recording storage to synthesize it.
- Multi-camera pairing remains unimplemented and is now represented honestly.
- MediaPipe services, pose mathematics, biomechanics, shot-cycle algorithms, score calculations, analytics calculations, and recording storage schemas were not changed by this pass. Camera request lifecycle handling was repaired; camera constraints and inference algorithms were retained.
