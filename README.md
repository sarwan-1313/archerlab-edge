<div align="center">

# ArcherLab Edge

### Privacy-first computer vision and performance analytics for precision archery

**[Live demo](https://archerlab-edge.vercel.app)** · **[Try the sample session](https://archerlab-edge.vercel.app)** · **[User guide](https://archerlab-edge.vercel.app/guide)**

![React](https://img.shields.io/badge/React-19-0b1326?logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-6-0b1326?logo=typescript&logoColor=3178c6)
![Vite](https://img.shields.io/badge/Vite-8-0b1326?logo=vite&logoColor=ffc53d)
![MediaPipe](https://img.shields.io/badge/MediaPipe-on--device-0b1326?logo=google&logoColor=2ee6ff)
![Tests](https://img.shields.io/badge/tests-124_cases-0b1326?logo=vitest&logoColor=3ddc84)
![Version](https://img.shields.io/badge/version-0.1.0-0b1326)

<img src="docs/images/landing.png" alt="ArcherLab Edge landing page: large 'ArcherLab Edge' headline, Start Analysis button and a glowing target in the background" width="100%" />

</div>

---

## From an athlete's problem to an engineering solution

ArcherLab Edge began with a question from my own experience as an archer:

> **Can technology help an athlete better understand the small details that influence performance consistency?**

Precision sports are decided by details that are hard to see: movement stability, body alignment, repeatability between attempts, and how technique relates to results. Analysing them usually takes expensive sensors, specialised equipment or hours of manual video review.

As both an athlete and a computer science student, I wanted to find out whether a standard laptop or phone camera, combined with modern computer vision, could make that analysis accessible, **while keeping every frame of the athlete's video on their own device.**

That became ArcherLab Edge: a system at the intersection of precision athletics, computer vision, biomechanics, statistics and privacy-preserving computing.

---

## Try it in ten seconds

No bow, no camera, no account needed.

1. Open **[archerlab-edge.vercel.app](https://archerlab-edge.vercel.app)**.
2. Click **Explore a sample session** under the main buttons.
3. Browse a 12-arrow round in **Analytics**, then click any arrow to open its **Replay**.

The sample session is not hard-coded data. Synthetic pose frames are run through the app's real `ShotCaptureEngine`, so every metric you see is genuine engine output.

To analyse yourself, click **Start Analysis**, allow camera access and stand side-on to the camera.

---

## One shot, four moments

The landing page walks through a single shot as you scroll: the draw, the hold, the release and the impact. Each step explains what ArcherLab Edge measures at that moment.

<div align="center">
<img src="docs/images/scroll-animation.gif" alt="Animation: a bow is drawn, the arrow is released and lands in the gold; readouts for draw, hold sway, release change and score update as it plays" width="760" />
</div>

---

## Screenshots

### Live Analysis

Pose landmarks are tracked live on the device. A broadcast-style status bar shows session time, shots and tracking state, and the biomechanics panel updates shoulder line, bow-arm angle, torso lean, head motion and bow-hand motion in real time.

<img src="docs/images/live.png" alt="Live Analysis screen: camera feed with pose skeleton overlay, orange Session Active status bar, and live biomechanics tiles" width="100%" />

<sub>Screenshot taken with a simulated camera feed and synthetic pose data; in real use the feed is your own camera.</sub>

### Performance Analytics

A scoreboard summary, a scorecard split into ends of six, where every arrow landed on the target, and arrow-by-arrow form charts coloured by score. These make it easy to see whether shaky holds line up with lower scores.

<img src="docs/images/analytics.png" alt="Analytics: total score 105 of 120, average 8.8, scorecard with ring-coloured arrows, and target group plot" width="100%" />

<img src="docs/images/analytics-trends.png" alt="Arrow-by-arrow bar charts for hold shoulder variation, bow-hand motion, head motion and release shoulder delta, coloured by score" width="100%" />

### Shot Replay

Every captured arrow can be reviewed on its own: the athlete-reported score, data-quality indicators, and each metric charted across hold, release and follow-through. Previous and next buttons step through the round.

<img src="docs/images/replay.png" alt="Replay of shot 3: gold 10 score badge, data quality tiles, and arrow stepper" width="100%" />

<img src="docs/images/replay-charts.png" alt="Shot cycle charts for shoulder line, bow arm and torso lean with hold and follow-through phases shaded and a dashed release marker" width="100%" />

### Sessions and guided setup

<table>
  <tr>
    <td width="50%"><img src="docs/images/sessions.png" alt="Training sessions library with a saved session open in the replay player" /></td>
    <td width="50%"><img src="docs/images/camera-setup.png" alt="Camera setup step with framing checklist and readiness steps" /></td>
  </tr>
  <tr>
    <td><b>Sessions.</b> Recordings are saved in the browser and replayed with synchronised telemetry and shot markers.</td>
    <td><b>Guided setup.</b> Camera framing, readiness checks and session start, before anything is recorded.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/summary.png" alt="Session complete summary with total shots and duration" /></td>
    <td width="50%"><img src="docs/images/guide.png" alt="User guide with three sections: prepare, train and review" /></td>
  </tr>
  <tr>
    <td><b>Session summary.</b> Shots captured, duration and per-shot review straight after training.</td>
    <td><b>User guide.</b> A ten-step manual from camera setup to analytics, with deep links for each step.</td>
  </tr>
</table>

### Mobile

The whole workflow works on a phone, with a raised **Live** button in the bottom navigation.

<img src="docs/images/mobile.png" alt="Four mobile screens: landing page, live analysis, analytics scoreboard and scorecard" width="100%" />

---

## What ArcherLab Edge does

### 1. On-device computer vision
MediaPipe Tasks Vision runs in the browser through WebAssembly: Pose Landmarker for the athlete's body, Hand Landmarker for gesture scoring. It includes athlete detection, skeleton visualisation, confidence-based quality handling and temporal smoothing. There is no cloud video inference.

### 2. Biomechanics engine
Landmarks are converted into archery-specific measurements: shoulder alignment, bow-arm geometry, torso position, head stability, bow-hand movement and variation over time. The engine is separate from the interface, so the calculations and the visuals can evolve independently.

### 3. Shot-cycle analysis
Archery is a sequence, not a single frame. Each shot is buffered and split into draw, hold, release and follow-through, with pre- and post-release windows, release metrics, data-quality summaries and follow-through analysis. Automatic release detection is available as an experimental option.

### 4. Touchless scoring
Archers can show their score with a hand gesture after each arrow, so they don't need to touch a device between shots. Stability confirmation guards against misreads, and manual and on-target entry are available as fallbacks.

### 5. Recording and replay
Sessions are recorded locally with synchronised pose telemetry and shot markers, then replayed from the Sessions library. Recorded data is kept separate from analytical data, so the analysis can improve without re-recording sessions.

### 6. Performance analytics
Totals, averages, a scorecard by end, target grouping, consistency statistics across shots, and a comparison of form between high- and low-scoring arrows. This comparison is presented as a descriptive association only; the app does not claim causation.

### 7. Experimental modelling
An exploratory layer simulates shot distributions and visualises uncertainty from observed groups. It is clearly labelled as experimental and is not presented as an arrow-impact predictor.

---

## System architecture

```text
Camera input
     │
     ▼
Local MediaPipe processing (WebAssembly)
     │
     ├──────────────────┐
     ▼                  ▼
Pose analysis      Hand analysis
     │                  │
     ▼                  ▼
Biomechanics       Gesture scoring
     │                  │
     └────────┬─────────┘
              ▼
       Shot-cycle capture
              │
              ▼
   Session analytics & replay
              │
              ▼
     Experimental modelling
```

## Privacy-first by design

```text
Camera ─► Local vision models ─► Landmarks ─► Biomechanics ─► Local session data
                     (nothing leaves the device)
```

- Video frames are processed in the browser and never uploaded.
- Profiles and recordings are stored on the device (IndexedDB).
- Fonts and models are self-hosted, so no visitor data is sent to third-party CDNs.
- No accounts and no analytics trackers.

---

## Technology stack

| Area | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Computer vision | MediaPipe Tasks Vision (Pose and Hand Landmarker), WebAssembly |
| Browser APIs | MediaDevices camera capture, MediaRecorder, IndexedDB, Canvas and SVG |
| Quality | Vitest + Testing Library (33 test files, 124 cases), oxlint, GitHub Actions CI |
| Hosting | Vercel (production deploys from `main`), GitHub Codespaces for development |

## Repository structure

```text
src/
├── analytics        session datasets and statistics
├── biomechanics     landmark geometry, smoothing, archery metrics
├── components       shared UI (camera, overlays, metric cards, navigation)
├── demo             sample session generated through the real capture engine
├── gesture-entry    hand-gesture score recognition
├── hooks            camera, pose, recording and shot-analysis hooks
├── landing          scroll-driven landing animation
├── pages            Live Analysis, Analytics, Replay, Sessions, Guide, Profile
├── profile          local athlete profile storage
├── recording        local session recording and replay storage
├── services         MediaPipe landmarker services
├── shot-analysis    shot buffering, release capture, phases, summaries
├── simulation       experimental shot-distribution modelling
├── styles           theme and self-hosted fonts
├── target           target-face geometry and scoring
├── training         guided session workflow state machine
└── types            typed domain models
```

---

## Running locally

```bash
npm ci
npm run dev        # start the dev server on http://localhost:5173
npm test           # run the test suite
npm run check      # lint + tests + production build
```

Camera access needs a secure context: `localhost` during development, HTTPS in production.

### Cloud development with GitHub Codespaces

GitHub is the source of truth, and Vercel deploys production from `main`.

1. Open the [repository](https://github.com/sarwan-1313/archerlab-edge), click **Code → Codespaces → Create codespace on main**.
2. Wait for the dev container and the automatic `npm ci` to finish.
3. Run `npm run dev` and open the forwarded port **5173**.
4. Run `npm test` during development and `npm run check` before pushing.

Real webcam testing uses the browser or device that opens the app.

### Guide deep links

The manual uses browser-history routes such as `/guide/camera-setup` and `/guide/analytics`. Vite serves them automatically. In production, `vercel.json` rewrites unknown paths to `index.html`, so refreshing or opening a guide link directly still works.

---

## Engineering highlights

- **Domain-driven.** Built around a real problem from competitive archery, not as an isolated technology demo.
- **Movement over time.** Shots are analysed as sequences with phases, not as independent frames.
- **Separation of concerns.** Camera, biomechanics, shot analysis, recording, analytics and UI are independent modules.
- **Honest analytics.** Experimental features are labelled, and associations are never presented as causation.
- **Complete product workflow.** Guided setup, live analysis, scoring, recording, replay, analytics and profiles.
- **Accessible.** Keyboard focus styles, reduced-motion support, and text contrast that meets the WCAG AA standard.

---

## Current status

**v0.1.0: experimental engineering prototype.** Current focus:

- validating the technical foundation;
- exploring browser-based sports intelligence;
- building toward athlete-centred research.

## Limitations

- Biomechanics outputs are not medically validated.
- Gesture scoring records what the athlete reports.
- Automatic release detection is experimental.
- Simulation outputs are exploratory.
- It is not a replacement for professional coaching, and not a medical device.

These limitations are documented on purpose, as part of responsible engineering.

## Roadmap

| Version | Focus |
| --- | --- |
| v0.2 | Robustness, smoother interaction workflows, user experience |
| v0.3 | Richer session analytics, comparisons across sessions, deeper visualisation |
| v0.5 | Athlete-specific datasets and personalised performance models |
| v1.0 | A mature computational sports-performance platform |

---

## Why I built this

A problem I experienced as an athlete became a technical question. That question became an engineering challenge, and that challenge became ArcherLab Edge.

This project sits where two disciplines meet:

**the precision of athletics and the creativity of computer science.**

<div align="center">

**ArcherLab Edge v0.1.0** · experimental public engineering prototype

</div>
