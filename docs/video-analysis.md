# Video analysis engine

ArcherLab Edge has two analysis engines:

| | Live engine (`src/biomechanics`, `src/shot-analysis`) | Video engine (`src/video-analysis`) |
| --- | --- | --- |
| Input | Camera, frame by frame as it happens | A recorded clip, from any camera angle |
| Time | Causal: can only look backwards | Offline: sees the whole clip, forwards and backwards |
| Smoothing | Lagging exponential filter | Zero-phase (centred) median + mean, so timing is not delayed |
| Release | Manual button or experimental candidate | Found automatically, then snapped to the sound of the shot |
| Output | Per-shot metrics during a session | Shots, phases, scores per area, estimated level, coaching, practice plan |

Both run entirely in the browser. The video engine is a separate module; it does not change the live engine.

## Pipeline

```text
Video file ──► audio track ──► spectral-flux onsets (release, clicker, impact)
     │                                         │
     ▼                                         │
Pass 1: pose model on every sampled frame      │
(playback-driven, requestVideoFrameCallback)   │
     │                                         │
     ▼                                         ▼
Frame features (2D + 3D) ──► smoothed tracks ──► release-first shot segmentation
     │                                              │
     │        Pass 2: re-track ±0.6 s around each   │
     └──────► release at the clip's full frame rate ┘
                                                    │
                                                    ▼
          per-shot metrics ──► session consistency ──► scores per area ──► level
                                                    │
                                                    ▼
                    findings ("what to work on"), strengths, practice plan, resources
```

Key files:

| File | Role |
| --- | --- |
| `browser/runVideoAnalysis.ts` | Orchestrates the passes and reports progress |
| `browser/frameCapture.ts` | Plays the clip and runs the pose model on each frame (seek fallback) |
| `browser/audioDecode.ts` | Decodes the audio track to 16 kHz mono |
| `frameFeatures.ts` | One pose sample → archery measurements |
| `detection.ts` | Drawing hand (auto) and camera angle |
| `track.ts`, `signal.ts` | Zero-phase smoothing and time-series helpers |
| `segmentation.ts` | Finds releases, anchors, draws, follow-throughs and let-downs |
| `audio.ts` | FFT, onset detection, and matching sounds to shots |
| `metrics.ts` | Per-shot and cross-shot measurements, each with a confidence |
| `rubric.ts`, `scoring.ts` | Scoring bands, area scores, level and level caps |
| `coaching.ts`, `resources.ts` | Findings, strengths, practice plan, verified links |
| `buildReport.ts` | Pure core: landmarks + audio in, report out |
| `testing/` | Synthetic archer and range audio used by the tests |

## Any camera angle

MediaPipe returns **world landmarks**: a 3D skeleton in metres, centred on the hips, estimated from a single camera. Angles and distances computed in 3D (bow-arm angle, elbow line, shoulder line, draw length) barely change when the camera moves around the archer, which is what lets one engine read side-on, angled and down-the-line footage. 2D measurements (sway, head movement) are normalised by **torso length**, which, unlike shoulder width, does not collapse when the camera looks along the shooting line.

The engine classifies the view from how wide the shoulders look relative to the torso:

| View | Shoulder ÷ torso (2D) | Strongest measurements |
| --- | --- | --- |
| Side-on (broadside) | ≥ 0.5 | Everything; best for release and posture |
| Angled (oblique) | 0.25–0.5 | 3D angles carry most of the analysis |
| Down the line | < 0.25 | Elbow line, bow arm; draw length and release travel are least certain |

Each measurement carries a confidence = landmark visibility × how well the view shows it × how many samples it had. Weak evidence counts for less everywhere downstream.

## Finding shots

Segmentation is **release-first**:

1. *Drawn* frames: drawing hand near the face, hands far apart, bow arm up.
2. A **release** is a burst of drawing-hand motion (relative to the head) straight out of a still, drawn position, that does not carry the hand forward toward the bow (that would be a let-down).
3. The **anchor** is the still stretch before the release where draw length stays at its anchored value; the **draw** starts where draw length begins to rise from its set-up minimum.
4. The **follow-through** lasts until the bow arm drops clearly.
5. A new shot is only accepted after the archer has come down from the previous one, so follow-through movements are never counted as releases.
6. Drawn periods without a burst are either a **let-down** (hand comes forward while the bow arm stays up), a release the **audio** heard, or a **"dead" release** with very little hand movement (the arms come down afterwards).

When the audio has a sharp transient near a visual release, the release time is taken from the sound (sub-millisecond resolution instead of a 33–80 ms video frame). A weaker, short click 40–600 ms earlier is reported as a possible **clicker**; the first clear transient 0.1–1.8 s later as the **arrow impact**. Sound and pose are cross-checked: the median audio–video offset is reported and applied to shots without a sound match. Loud sounds with no visible shot are counted separately (other archers on the range).

## Scoring

Every threshold below is a **coaching heuristic** for this prototype, kept in `rubric.ts` so it can be tuned. A value at the first number scores 100, then 82, 58 and 30 at the following numbers, sliding to 10 beyond the last.

| Area | Measurement | Good → poor | Notes |
| --- | --- | --- | --- |
| Draw alignment | Bow-arm angle at anchor | ≥ 172 / 165 / 155 / 145° | compound: ≥ 168 / 160 / 150 / 140° |
| Draw alignment | Draw elbow line | ≤ 10 / 18 / 28 / 40° |  |
| Draw alignment | Shoulder line vs arrow | ≤ 8 / 14 / 22 / 32° |  |
| Stance & posture | Shoulder height difference | ≤ 0.04 / 0.08 / 0.13 / 0.2 SW |  |
| Stance & posture | Torso lean | ≤ 4 / 7 / 11 / 16° |  |
| Aiming stability | Bow-hand movement while aiming | ≤ 1.5 / 2.5 / 4 / 6 % torso |  |
| Aiming stability | Head movement while aiming | ≤ 0.8 / 1.5 / 2.5 / 4 % torso |  |
| Aiming stability | Anchor steadiness | ≤ 1 / 1.8 / 3 / 5 % torso |  |
| Aiming stability | Draw-length change before release | ≥ 0 / -2.5 / -5 / -9 %SW/s | experimental |
| Release | Release direction (backwards along the arrow) | ≥ 0.85 / 0.7 / 0.5 / 0.3 |  |
| Release | Draw-hand travel after release | ≥ 0.35 / 0.22 / 0.12 / 0.06 SW | not scored for compound |
| Release | Head movement at release | ≤ 1 / 2 / 3.5 / 6 % torso |  |
| Follow-through | Bow-arm drop after release | ≤ 0.08 / 0.15 / 0.25 / 0.4 SW |  |
| Follow-through | Follow-through hold | ≥ 1.2 / 0.8 / 0.5 / 0.25 s |  |
| Rhythm & consistency | Aiming time (anchor to release) | best 1.5–4.5 s; outside by 0.5 / 1.2 / 2.5 |  |
| Rhythm & consistency | Draw time | best 1–3 s; outside by 0.4 / 1 / 2 |  |
| Rhythm & consistency | Clicker-to-release reaction | ≤ 0.15 / 0.25 / 0.4 / 0.6 s | experimental |
| Rhythm & consistency | Anchor position consistency | ≤ 0.03 / 0.06 / 0.1 / 0.16 SW | needs 2+ shots |
| Rhythm & consistency | Aiming-time consistency | ≤ 0.08 / 0.15 / 0.25 / 0.4 CV | needs 2+ shots |
| Rhythm & consistency | Draw-time consistency | ≤ 0.1 / 0.18 / 0.3 / 0.45 CV | needs 2+ shots |
| Rhythm & consistency | Bow-arm consistency | ≤ 1.5 / 3 / 5 / 8° | needs 2+ shots |

SW = shoulder widths (3D); % torso = percent of 2D torso length; CV = coefficient of variation.

**Areas** are confidence-weighted averages of their measurements. The **form score** is `0.7 × weighted average of the areas + 0.3 × the weakest area`, because skill is limited by the weakest phase of the shot. The same formula gives each shot its own score.

**Level**: Beginner < 50 ≤ Intermediate < 68 ≤ Advanced < 82 ≤ Elite-level form. A clear fault in a fundamental area (stance, alignment, stability or release) **caps** the level: a measurement scoring below 45 caps it at Intermediate, below 60 at Advanced. The report says when a cap applied and what lifts it.

**Confidence** (low / medium / high) combines how many areas could be measured, the number of shots (3+ for full confidence), how much of the clip was tracked, and how clear the camera angle was. The reasons are listed in the report.

## Coaching output

- **What to work on**: up to three focus areas from different areas of the shot, ranked by `(100 − score) × weight × confidence`. Each has what was measured, why it matters, how to fix it, a drill, a "Show me" button that jumps the replay to the worst shot and rings the joint involved, and matched links.
- **What you do well**: measurements scoring 85+ with good confidence.
- **Your next sessions**: a short plan built from the focus areas and the level, including a recording tip when confidence is low and a draw-weight check when several signs point to an over-bowed archer.
- **Watch & read**: curated links (World Archery, Archery GB's Start Archery, Archery 360, Bow International, KSL), checked when added, plus clearly labelled YouTube searches.
- **Profile**: when enabled, the estimated level, score history and focus areas are written to the athlete profile. The self-reported experience level is never overwritten; the profile offers a one-tap "use this level".

## Verification

- **Unit tests** run the pure engine against a deterministic synthetic archer (`testing/syntheticArcher.ts`) filmed from any angle, left- or right-handed, with scripted faults (bent bow arm, raised shoulder, lean, sway, plucking, flinch, creep, dropped bow arm, dead release, let-downs, tracking dropouts), plus synthetic range audio. They check shot timing (within one frame; within 3 ms with audio), let-down rejection, fault detection, level caps and confidence.
- **End to end**, the browser pipeline was run in Chromium on a rendered synthetic clip with a stand-in pose model: playback capture, the precision pass, audio decoding, the report, replay, profile update, history and mobile layout.
- **Not yet validated on real athletes.** The thresholds need tuning against real clips and coach ratings; that is the most valuable next step.

## Tuning with real footage

1. Analyse a clip, then **Export report (JSON)**. The export contains every frame's landmarks and the per-shot measurements.
2. Compare the measurements with what a coach sees, and adjust the bands in `rubric.ts` (or segmentation thresholds in `config.ts`).
3. Add the clip's landmarks as a fixture test so the behaviour stays fixed.

## Larger pose models

The Lite pose model ships with the app. For more accurate landmarks, download the Full and/or Heavy models from Google's MediaPipe model storage:

```bash
npm run models:pose          # Full model (~9 MB)
npm run models:pose -- heavy # Heavy model (~29 MB, slower)
```

The script saves them in `public/models/` and lists them in `public/models/models.json`; the Video Analysis settings then offer them. Commit the files to deploy them.

## Limits

- The level reflects movement only: the camera does not see the target or the score.
- Thresholds are heuristics, not a validated standard; a qualified coach is the final word.
- Depth comes from a single camera, so movement toward or away from the lens is the least precise.
- Clicker and impact sounds are best-effort and can be confused by other archers.
- With several people in frame, the most prominent person is followed.
- Very long clips take time; the tab must stay visible (browsers pause hidden video).
