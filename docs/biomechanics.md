# Milestone 3 biomechanics engine

ArcherLab now derives live measurements only from the existing on-device `PoseResult`. It does not score technique or provide coaching advice.

## Conventions

- Right-handed means the bow is held in the left hand; left-handed means the bow is held in the right hand.
- Shoulder line uses normalized image landmarks and is signed relative to image horizontal.
- Torso lean uses the hip midpoint to shoulder midpoint axis. Positive values lean toward screen-right.
- Bow-arm elbow angle prefers MediaPipe world landmarks and falls back to normalized image landmarks when the world triplet is unavailable.
- Motion is normalized by the shoulder width of each sample. Head and bow-hand cards report RMS displacement as percent of shoulder width.
- Shoulder variation is the standard deviation of unwrapped shoulder-line angles.
- Temporal metrics use a two-second, timestamp-pruned buffer and require at least four samples spanning 500 ms.
- The time-aware EMA resets after long tracking gaps. Changing handedness, stopping the camera, or losing tracking clears temporal state.
- A reference pose is the median of at least six quality-gated frames spanning at least 750 ms during a roughly 900 ms capture.

## Manual verification

1. Create a new session and test both handedness choices. Confirm the debug panel reports the opposite bow side.
2. Complete calibration, hold a full-draw/anchor posture, and capture a reference. Confirm the live page shows angle deltas.
3. Raise one shoulder, bend the bow elbow, and lean both directions. Confirm signed angle changes are plausible rather than interpreted as scores.
4. Hold the head and bow hand still for two seconds, then move each. Confirm RMS movement changes after the history warm-up.
5. Occlude a required shoulder, hip, ear/nose, elbow, or wrist. Confirm the affected card becomes unavailable.
6. Leave frame for more than one second and return. Confirm temporal cards warm up again rather than retaining old history.
7. Switch camera, camera view, and pages. Confirm tracking cleanup remains intact and temporal values do not leak across sessions.
8. Resize the window and confirm the existing skeleton remains aligned while metric cards remain responsive.

These measurements are observational pose-derived values. They are not medical guidance or validated performance judgments.
