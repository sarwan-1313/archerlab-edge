# Checking the scores against coaches

ArcherLab's form scores and levels come from a rubric of **coaching heuristics** (`src/video-analysis/rubric.ts`). Until they are compared with real coaches' judgement, the app labels them as unvalidated estimates. This page describes how to make that comparison honestly: collect clips, have a coach label them, export them as fixtures, and run `npm run validate:fixtures`.

## 1. Turn on Coach tools

Profile → **Coach tools** → *Show coach tools*. It is off by default and stays on the device. With it on, a video report has a **Label this clip** panel below the shot table. For each shot the coach can:

- step the release to the exact frame with **−1f / +1f** (frames of the original clip); clicking the time shows that moment in the replay;
- say what it was: **Shot**, **Not a shot** (the engine's false detection) or **Let-down**;
- add a shot the engine missed with **Add a missed shot here**, at the replay's current time;
- rate each area (stance & posture, draw alignment, aiming stability, release, follow-through, rhythm & consistency) from **1 (poor) to 5 (excellent)**, leaving out what they cannot judge from the footage;
- give the archer an **overall level** for the clip.

**Save labels** keeps them with the report on the device (re-scoring keeps them). **Export as fixture** downloads a JSON file with the body landmarks, the sound onsets and an `expected` block built from the labels. The file never contains the video or any image.

## 2. Collect clips ethically

- **Consent first.** Only film and label archers who have agreed, in writing where a club or school is involved, to their movement data being used to test the app. Say what is kept (body landmarks and the coach's labels) and who sees it.
- **Under-18s need a parent or guardian's consent** as well as the archer's own agreement. Follow your club's or federation's safeguarding policy, which may be stricter.
- **Raw videos stay private.** Keep them on the device or in private storage you control. They are never committed, shared in issues or uploaded to the app's cloud features for this purpose.
- **Only landmark fixtures are committed.** A fixture holds 33 body points per frame and timings, not pictures, but it is still personal movement data: name files by setup (`recurve-side-on-6-shots.json`), never by person, and remove a fixture if the archer asks.
- Prefer clips with **one archer in frame**; the tool follows the most prominent person, and bystanders should not end up in anyone's dataset.

## 3. How many clips are useful

| Goal | Clips | Why |
| --- | --- | --- |
| Shot detection and release timing | 10–20 clips, 5–10 shots each | Detection errors are easy to see per shot; a hundred labelled shots shows the common failure modes |
| A first reading of the area scores | 30+ clips from 10+ archers, several levels | Spearman needs spread: if everyone is "intermediate", nothing can correlate |
| Tuning the rubric with some confidence | 60–100+ clips, 2 coaches labelling the same clips | Two coaches show how much experts themselves disagree, which is the ceiling for the engine |

Mix camera angles (side-on, angled, down the line), bow types, light and distances, in roughly the proportions athletes really film.

## 4. Run the validation

Copy exported fixtures into `src/video-analysis/fixtures/` and run:

```bash
npm run validate:fixtures
```

It re-runs the current engine on every fixture and prints:

- **Shot detection precision and recall**: detections matched to labelled releases within the fixture's tolerance (0.1 s), closest first; unmatched detections are false positives (let-downs counted as shots land here), unmatched labels are misses.
- **Release timing**: the median absolute and signed error of matched shots, in milliseconds (signed: engine minus label, so positive means the engine is late).
- **Area scores vs coach ratings**: Spearman rank correlation, per area, between the engine's per-shot area score and the coach's 1–5 rating, over all matched shots (ties averaged). Shown with `n`; below 3 pairs it is "–".
- **Level agreement**: how often the clip's level equals the coach's, and how often it is within one level.

It **fails only on detection regressions**: when precision or recall falls below `src/video-analysis/validation/validation-baseline.json`. The correlations never fail the run; they are for learning. After a deliberate change that improves detection, store a new baseline with `UPDATE_VALIDATION_BASELINE=1 npm run validate:fixtures` and commit it. The ordinary `npm test` also runs `src/video-analysis/fixtures.test.ts`, which checks each fixture's shot count and release times.

## 5. Tune the rubric from the results

1. **Fix detection before scores.** Area scores are only meaningful on the right shots at the right release time. Look at fixtures with misses or extra shots first (`segmentation.ts`, `VIDEO_CONFIG`).
2. **Read each area's ρ with its `n`.** With a few dozen shots, ρ is noisy; treat |ρ| below about 0.3 as "no evidence either way". A negative ρ means a band points the wrong way or measures something else.
3. **Find the metric.** An area is a weighted blend of metrics. Compare each metric's per-shot score with the coach's rating for that area; one metric usually carries the disagreement.
4. **Move bands, then weights.** Change a band's thresholds in `rubric.ts` so the shots coaches rate 4–5 score above about 82 and the ones rated 1–2 below about 58, then re-run. Change weights only when a metric clearly tracks the coaches better than its neighbours.
5. **Don't fit the noise.** Keep some clips aside (a different archer or session) and check that a change helps them too. If two coaches disagree on a clip, do not tune toward either one.
6. **Only then change the wording.** When an area's correlation is consistently clear on clips the tuning never saw, the README and reports can describe that area as checked against coach ratings, with the number of clips and coaches. Until then, keep calling the scores heuristic estimates.

## Files

| File | Role |
| --- | --- |
| `src/settings/coachTools.ts` | The Coach tools setting |
| `src/components/video/LabelPanel.tsx` | The labelling panel |
| `src/video-analysis/validation/labels.ts` | Starting labels, frame steps, the `expected` block, fixture export |
| `src/video-analysis/validation/stats.ts` | Shot matching, precision and recall, median, Spearman, level agreement (tested in `stats.test.ts`) |
| `src/video-analysis/validation/validateFixtures.test.ts` | `npm run validate:fixtures` |
| `src/video-analysis/fixtures/` | The fixtures ([format](../src/video-analysis/fixtures/README.md)) |
