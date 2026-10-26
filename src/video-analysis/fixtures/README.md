# Real-clip fixtures

`../fixtures.test.ts` re-scores every `*.json` file in this folder with the current video engine and checks it against what a person counted in the clip. Use fixtures to catch regressions in shot and release detection on real footage, which the synthetic archer in `../testing/` cannot fully stand in for.

With no fixtures here, the test still passes.

## Adding a fixture

1. Analyse the clip in the app (Video Analysis). Choose the settings you want the fixture to keep, such as drawing hand and bow type; they are stored in the report and used when it is re-scored.
2. On the report, press **Export report (JSON)**. Reports opened from an account have no landmarks; export from the device that analysed the clip.
3. Watch the clip and note each release time in seconds of video time (scrub frame by frame around each shot).
4. Copy the exported file here with a descriptive name, e.g. `recurve-side-on-4-shots.json`, and add an `expected` block at the top level:

```json
{
  "expected": {
    "shots": 4,
    "releases": [6.62, 15.48, 24.71, 33.9],
    "toleranceS": 0.1
  },
  "id": "video_…",
  "samples": [ … ],
  …
}
```

- `shots` (required): how many shots the engine should report. This includes shots that were only heard (audio-only).
- `releases` (optional): one release time in seconds per shot, in order.
- `toleranceS` (optional, default `0.1`): how far a detected release may be from the counted time.

5. Run `npx vitest run src/video-analysis/fixtures.test.ts`.

## Keep in mind

- A fixture holds the body landmarks of the person in the clip. Only add clips of yourself, or of someone who has agreed to their movement data being committed to this repository.
- Exports can be several megabytes. Trim the clip to the shots you need before analysing it.
- If an engine change makes a fixture fail, check the clip again before you change `expected`: the fixture records what happened in the video, not what the engine used to report.
