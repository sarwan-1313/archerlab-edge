import { makeScenario, scriptShots } from '../../src/video-analysis/testing/syntheticArcher';
import type { SyntheticAudioEvent } from '../../src/video-analysis/testing/syntheticAudio';

/**
 * The scripted session behind e2e/fixtures/synthetic-archer.webm. The clip
 * generator draws it, and the stubbed pose model (VITE_E2E=1) returns its
 * landmarks for each video timestamp, so the video and the pose always agree.
 */
export const E2E_SHOT_COUNT = 2;
export const E2E_CLIP_FILE = 'synthetic-archer.webm';
export const E2E_CLIP_FPS = 30;
export const E2E_CLIP_SIZE = { width: 640, height: 360 };

// A few real faults, so the report has findings with a "Show me" button.
export const E2E_SCENARIO = makeScenario({
  shots: scriptShots(E2E_SHOT_COUNT, {
    spacing: 8,
    faults: { bowElbowBend: 30, bowShoulderRaise: 0.05, swayAmplitude: 0.02, pluck: 0.7, headFlinch: 0.03, dropArm: 0.1 },
  }),
});

export const E2E_AUDIO_SAMPLE_RATE = 48000;

/** A clicker tick, the release and the arrow hitting the target, for every shot. */
export const E2E_AUDIO_EVENTS: SyntheticAudioEvent[] = E2E_SCENARIO.shots.flatMap((shot) => [
  { t: shot.release - 0.2, kind: 'clicker' },
  { t: shot.release, kind: 'release' },
  { t: shot.release + 0.45, kind: 'impact' },
]);
