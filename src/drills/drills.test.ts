import { describe, expect, it } from 'vitest';
import { DRILLS, READY_S, drillById, drillDurationS, drillState, drillsFor } from './drills';
import { EMPTY_EQUIPMENT, estimateSightMark, isEquipmentData, loadEquipment, newBow, saveEquipment, setSightMark } from '../equipment/equipment';
import { parseHeartRate, summariseHeartRate } from '../sensors/heartRate';
import { outlierShots, rhythmRows, spread, steadiness } from '../video-analysis/rhythm';
import type { ShotReport } from '../video-analysis/types';

describe('drills', () => {
  const drill = { reps: 2, workS: 10, restS: 5 };
  it('runs get-ready, work and rest, with no rest after the last rep', () => {
    expect(drillState(drill, 0)).toEqual({ phase: 'ready', rep: 1, remaining: READY_S });
    expect(drillState(drill, (READY_S + 1) * 1000)).toEqual({ phase: 'work', rep: 1, remaining: 9 });
    expect(drillState(drill, (READY_S + 12) * 1000)).toEqual({ phase: 'rest', rep: 1, remaining: 3 });
    expect(drillState(drill, (READY_S + 16) * 1000)).toEqual({ phase: 'work', rep: 2, remaining: 9 });
    expect(drillState(drill, (READY_S + 26) * 1000).phase).toBe('done');
    expect(drillDurationS(drill)).toBe(READY_S + 25);
  });
  it('suggests drills for a focus area first', () => {
    expect(drillsFor('posture')[0].id).toBe('posture-wall');
    expect(drillsFor('rhythm')[0].areas).toContain('rhythm');
    expect(drillsFor(null)).toHaveLength(DRILLS.length);
    expect(drillById('reversals')?.reps).toBe(10);
    expect(new Set(DRILLS.map((item) => item.id)).size).toBe(DRILLS.length);
  });
});

describe('sight marks', () => {
  it('returns a recorded mark, interpolates and extrapolates', () => {
    let marks = setSightMark([], 30, 6);
    marks = setSightMark(marks, 50, 4);
    expect(estimateSightMark(marks, 30)).toEqual({ mark: 6, basis: 'recorded' });
    expect(estimateSightMark(marks, 40)).toEqual({ mark: 5, basis: 'between' });
    expect(estimateSightMark(marks, 70)?.basis).toBe('beyond');
    expect(estimateSightMark(marks.slice(0, 1), 40)).toBeNull();
    marks = setSightMark(marks, 50, 4.2);
    expect(marks).toHaveLength(2);
  });
  it('fits a curve through three or more marks', () => {
    // mark = 10 - 0.05·d - 0.001·d² exactly.
    const f = (d: number) => 10 - 0.05 * d - 0.001 * d * d;
    const marks = [18, 30, 50, 70].map((d) => ({ distanceM: d, mark: f(d) }));
    expect(estimateSightMark(marks, 60)!.mark).toBeCloseTo(f(60), 6);
  });
  it('stores equipment', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    expect(loadEquipment(storage)).toEqual(EMPTY_EQUIPMENT);
    const bow = newBow('Hoyt');
    saveEquipment({ bows: [bow], activeBowId: bow.id }, storage);
    expect(loadEquipment(storage).bows[0].name).toBe('Hoyt');
    expect(isEquipmentData({ bows: [{ id: 1 }] })).toBe(false);
  });
});

describe('heart rate', () => {
  it('reads 8-bit and 16-bit values', () => {
    expect(parseHeartRate(new DataView(new Uint8Array([0, 72]).buffer))).toBe(72);
    expect(parseHeartRate(new DataView(new Uint8Array([1, 0x2c, 0x01]).buffer))).toBe(300);
    expect(parseHeartRate(new DataView(new Uint8Array([0]).buffer))).toBeNull();
    expect(summariseHeartRate([70, null, 80])).toEqual({ mean: 75, min: 70, max: 80, count: 2 });
    expect(summariseHeartRate([])).toBeNull();
  });
});

describe('shot rhythm', () => {
  const shot = (index: number, drawStart: number, anchorStart: number, release: number, followThroughEnd: number) => ({ index, drawStart, anchorStart, release, followThroughEnd, source: 'video' }) as unknown as ShotReport;
  it('times each phase and rates consistency', () => {
    const rows = rhythmRows([shot(0, 0, 2, 6, 7), shot(1, 10, 12, 16.2, 17), shot(2, 20, 22, 25.8, 27), shot(3, 30, 32, 40, 41)]);
    expect(rows[0]).toEqual({ index: 0, draw: 2, hold: 4, follow: 1, total: 7 });
    const holds = spread(rows.slice(0, 3).map((row) => row.hold));
    expect(holds!.mean).toBeCloseTo(4);
    expect(steadiness(holds)).toBe('very steady');
    expect(steadiness(spread([1, 3]))).toBe('varies a lot');
    expect(outlierShots(rows)).toEqual([3]);
    expect(spread([1])).toBeNull();
  });
});
