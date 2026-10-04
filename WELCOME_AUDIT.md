ArcherLab Edge — Welcome/Home functional audit, 2 October 2026

Welcome repairs are complete within the authorized scope. The single-camera-initialization acceptance criterion still fails in the existing camera hook, which was explicitly excluded from modification. Real-athlete readiness and Live Analysis have not been verified end to end in the browser.

Problems, causes, and repairs:

| Problem | Root cause | Repair |
| --- | --- | --- |
| Rapid Start Analysis clicks created two history entries. | Navigation compared against rendered React state while the native view-transition callback was still pending. Session reset work could run again before the route rendered. | Track accepted navigation synchronously; ignore duplicate pending Start requests before resetting the flow. Regression test verifies one history entry, one presentation request, and one analysis-page mount. |
| Clicking Home during an unfinished Guide transition was ignored. Older presentation callbacks could override newer requests. | Rendered page state lagged behind the accepted destination; callbacks had no navigation revision check. | Use the accepted destination for navigation and browser Back handling; discard stale presentation callbacks. |
| Home could retain a scrolled position after visiting a long page. | Return navigation had no Home scroll reset. | Reset scroll when Home is actually committed. |
| Home faded in from an initially transparent page wrapper. | The shared fallback entry animation also applied to eager Home content. | Suppress the initial Home animation; retain navigation transitions and real lazy-route loading. |
| How It Works allowed keyboard focus into the underlying Home screen. Rapid batched slide changes could exceed either end of the slides array. | No focus containment/restoration, and unbounded Next/Back updates. | Trap Tab/Shift+Tab within the dialog, restore the opener on close, stabilize the close callback, and clamp slide updates. |
| Highlight descriptions were truncated at 768px; mobile content had excess vertical space. | Three fixed highlight columns remained beside the desktop sidebar; inherited minimum heights compounded mobile navigation padding. | Stack highlights at tablet widths, allow text wrapping, correct Home-only minimum heights, and reduce hero spacing. |
| The secondary action competed with Start Analysis. | How It Works used a bordered secondary button beside a ghost User Guide action. | Give both secondary actions quiet styling while retaining the existing cyan primary CTA. |

Welcome actions checked in Chrome against the production build:

| Action | Result |
| --- | --- |
| Start Analysis | First click opens Camera Setup at `/analysis`. Rapid repeated activation adds one history entry and one transition. |
| User Guide | Opens `/guide`; browser Back/Forward and the app Back action return to the correct page. |
| How It Works | Opens the quick-start dialog; Next, Back, step selection, Close, Skip, Escape, focus containment, and focus restoration work. Its Start Analysis action closes the dialog and opens Camera Setup. |
| Sessions | Opens `/sessions`; Home returns to `/`. Checked at all four widths. |
| Analytics | Opens `/analytics`; Home returns to `/`. Checked at all four widths. |
| Live / Live Analysis navigation | Opens Camera Setup at `/analysis` from both mobile and desktop navigation. |
| Home navigation and brand | Return to `/`, reset scroll, and remain responsive during pending navigation. Repeated Home activation does not add history entries. |
| Mobile profile action | Opens `/profile`; the brand returns Home. |
| Refresh | Home reloads correctly; dismissed onboarding stays dismissed under its existing storage behavior. |

No visible Home action was an unimplemented control. URL mappings and lazy-loaded pages were preserved. The existing training workflow uses `/analysis` for Camera Setup, Readiness Check, Ready to Begin / Start Session, and Live Analysis; legacy routes were left intact.

Responsive results (900px viewport height):

| Width | Horizontal overflow | CTA visible | Highlight text readable | Navigation usable |
| --- | --- | --- | --- | --- |
| 430px | None | Yes | Yes | Yes |
| 768px | None | Yes | Yes | Yes |
| 1024px | None | Yes | Yes | Yes |
| 1440px | None | Yes | Yes | Yes |

Validation:

- `npm run build`: passed (invoked with `npm.cmd` because PowerShell blocks `npm.ps1`). Lazy page chunks remain separate.
- `npm test`: passed, 23 files / 100 tests, including seven added navigation and modal regression tests.
- `git diff --check`: passed.
- Browser frame sampling: zero empty-content frames after first render, zero Home loaders, and zero fullscreen loaders.
- Slow-load check: the audit delayed the Guide chunk by 400ms at the browser network layer. Real route loading feedback appeared; the shell stayed populated. No delay was added to application code.
- Home did not request the Guide, Sessions, or Analytics chunks eagerly and made no camera requests.
- Browser console: no Home/action errors or uncaught JavaScript exceptions. Entering analysis produced existing MediaPipe OpenGL/feedback warnings and an informational XNNPACK message emitted through `console.error`; these were retained in the raw audit output.
- A DevTools conditional breakpoint at pose-runtime creation counted one MediaPipe initialization across two separate setup entries. No MediaPipe source was edited. Earlier production observations also showed one local model/WASM resource set.
- The existing workflow integration test passes Camera Setup → Readiness Check → Ready to Begin → Start Session → Live Analysis and checks that camera/pose hooks remain mounted. Its camera and pose inputs are mocked.

Files changed by this task (other pre-existing workspace changes were preserved):

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Navigation deduplication, stale callback protection, Home scroll reset, Home styling hook, stable dialog close callback. |
| `src/pages/HomePage.tsx` | Reduce secondary action emphasis. |
| `src/components/OnboardingModal.tsx` | Focus containment/restoration and safe slide bounds. |
| `src/index.css` | Home startup, spacing, and responsive layout repairs. |
| `src/App.welcome.test.tsx` | Five navigation regressions. |
| `src/components/OnboardingModal.test.tsx` | Two modal regressions. |
| `browser-welcome-check.mjs` | Repeatable production-browser audit, screenshots, and JSON results. |
| `WELCOME_AUDIT.md` | Findings, validation, and remaining limitations. |

Remaining issues and verification limits:

1. **Camera acquisition is not single-initialization.** Both one click and a rapid double click caused four `getUserMedia` requests on a production setup entry, despite one history entry and one transition. The existing `useLocalCamera` startup effect depends on selected-device state and a callback that changes with that state; startup/device enumeration changes can retrigger it. The hook also falls back to a stream ID when choosing a device ID. This code was not changed because camera processing was excluded. The Welcome navigation defect is repaired, but this acceptance criterion cannot be marked passed.
2. **Real readiness remains unverified.** Chrome's synthetic camera contains no athlete, so Continue to Readiness correctly remains disabled. No pose outputs or readiness guards were bypassed in the browser. Real-athlete testing is still needed for the full setup-to-live path; the passing mocked workflow test is supplementary evidence.
3. No remaining defect was observed in the authorized Welcome controls, routing, loading behavior, or tested layouts.

Reproduce with a local preview server on port 5179 and an isolated headless Chrome profile exposing DevTools on port 9335, with fake-device/fake-permission media flags. Run `node browser-welcome-check.mjs http://127.0.0.1:5179 9335`. The script changes onboarding state only in that disposable browser profile. Screenshots and `report.json` are written under `node_modules/.welcome-audit/` and are not production assets.

No changes were made to MediaPipe, camera processing, biomechanics, shot-cycle logic, scoring, analytics calculations, persistence implementation, or unrelated page designs. No external API was added.
