import { describe, expect, it } from 'vitest';
import { detectOnsets } from './audio';
import { computeFrameFeatures } from './frameFeatures';
import { phaseAt, segmentShots } from './segmentation';
import { makeScenario, scriptShots, syntheticSamples, type SyntheticScenario } from './testing/syntheticArcher';
import { synthesizeRangeAudio } from './testing/syntheticAudio';
import { buildFeatureTrack } from './track';

function segment(scenario: SyntheticScenario, fps = 24, withAudio = false) {
  const samples = syntheticSamples(scenario, fps);
  const track = buildFeatureTrack(samples.map((sample) => computeFrameFeatures(sample, scenario.aspect, scenario.drawSide)));
  const onsets = withAudio
    ? detectOnsets(synthesizeRangeAudio(scenario.durationS, scenario.shots.filter((shot) => !shot.letDown).map((shot) => ({ t: shot.release, kind: 'release' as const }))), 16000).onsets
    : null;
  return segmentShots(track, onsets, { start: 0, end: scenario.durationS });
}

describe('segmentShots', () => {
  it('finds every shot and places releases within a frame', () => {
    const scenario = makeScenario({ shots: scriptShots(4) });
    const result = segment(scenario);
    expect(result.shots).toHaveLength(4);
    result.shots.forEach((shot, index) => {
      expect(Math.abs(shot.release - scenario.shots[index].release)).toBeLessThan(1 / 24 + 0.01);
      expect(shot.anchorStart).not.toBeNull();
      expect(Math.abs((shot.anchorStart as number) - scenario.shots[index].anchor)).toBeLessThan(0.35);
      expect(shot.drawStart).not.toBeNull();
      expect(shot.drawStart as number).toBeLessThan(shot.anchorStart as number);
      expect(shot.followThroughEnd as number).toBeGreaterThan(shot.release + 0.8);
    });
  });

  it('works at a low frame rate and from down the line', () => {
    const scenario = makeScenario({ shots: scriptShots(3), yawDeg: 88 });
    const result = segment(scenario, 12);
    expect(result.shots).toHaveLength(3);
  });

  it('records a let-down instead of a shot', () => {
    const scenario = makeScenario({
      shots: [
        ...scriptShots(1),
        { raiseStart: 10, drawStart: 11.2, anchor: 13, release: 15, followThrough: 1.3, letDown: true },
        ...scriptShots(1, { start: 19 }),
      ],
    });
    const result = segment(scenario);
    expect(result.shots).toHaveLength(2);
    expect(result.letDowns).toHaveLength(1);
    expect(result.letDowns[0].start).toBeGreaterThan(11);
    expect(result.letDowns[0].end).toBeLessThan(16);
  });

  it('snaps releases to the audio and keeps shots across a brief tracking dropout', () => {
    const scenario = makeScenario({ shots: scriptShots(3), dropouts: [[13.0, 13.4]] });
    const result = segment(scenario, 12, true);
    expect(result.shots).toHaveLength(3);
    result.shots.forEach((shot, index) => {
      expect(shot.releaseSource).toBe('audio');
      expect(Math.abs(shot.release - scenario.shots[index].release)).toBeLessThan(0.003);
    });
    expect(result.matchedReleases).toBe(3);
  });

  it('labels phases over time', () => {
    const shot = { drawStart: 2, anchorStart: 4, release: 6.5, followThroughEnd: 8, releaseSource: 'visual' as const };
    expect(phaseAt(3, [shot]).phase).toBe('draw');
    expect(phaseAt(5, [shot]).phase).toBe('anchor');
    expect(phaseAt(6.5, [shot]).phase).toBe('release');
    expect(phaseAt(7, [shot]).phase).toBe('follow-through');
    expect(phaseAt(9, [shot]).phase).toBe('idle');
  });
});
