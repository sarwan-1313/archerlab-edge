import { describe, expect, it } from 'vitest';
import { entryFromRound } from './practice';
import { ROUNDS, faceById, maxRoundScore, roundById } from './rounds';
import {
  addArrow, arrowAt, arrowFromLabel, arrowLabel, completedEnds, directionOf, grouping, groupingHints, isComplete, isScoredRound,
  newRound, roundTotals, scoreButtons, scorePoint, sortEnd, toCm, undoArrow,
} from './scoring';
import { beepsFor, formatClock, timerState } from './timer';

describe('scoring a point on the face', () => {
  it('scores each ring of a full face, with the X inside the 10', () => {
    expect(scorePoint(0, 0, 'full')).toEqual({ score: 10, isX: true });
    expect(scorePoint(0.07, 0, 'full')).toEqual({ score: 10, isX: false });
    expect(scorePoint(0.15, 0, 'full').score).toBe(9);
    expect(scorePoint(0, 0.55, 'full').score).toBe(5);
    expect(scorePoint(0.95, 0, 'full').score).toBe(1);
    expect(scorePoint(1.01, 0, 'full')).toEqual({ score: 0, isX: false });
  });

  it('gives a line-cutter the higher score', () => {
    expect(scorePoint(0.1, 0, 'full').score).toBe(10);
    expect(scorePoint(0.2, 0, 'full').score).toBe(9);
  });

  it('scores a spot face from 10 to 6 and misses outside it', () => {
    expect(scorePoint(0, 0, 'spot')).toEqual({ score: 10, isX: true });
    expect(scorePoint(0.15, 0, 'spot')).toEqual({ score: 10, isX: false });
    expect(scorePoint(0.3, 0, 'spot').score).toBe(9);
    expect(scorePoint(0.9, 0, 'spot').score).toBe(6);
    expect(scorePoint(1.05, 0, 'spot').score).toBe(0);
    expect(scoreButtons('spot')).toEqual(['X', '10', '9', '8', '7', '6', 'M']);
  });

  it('reads score buttons', () => {
    expect(arrowFromLabel('X')).toMatchObject({ score: 10, isX: true, x: null });
    expect(arrowFromLabel('7').score).toBe(7);
    expect(arrowFromLabel('M').score).toBe(0);
    expect(arrowLabel(arrowFromLabel('M'))).toBe('M');
    expect(sortEnd([arrowFromLabel('7'), arrowFromLabel('X'), arrowFromLabel('10')]).map(arrowLabel)).toEqual(['X', '10', '7']);
  });
});

describe('a round', () => {
  const preset = roundById('wa-18');

  it('fills ends in order and starts the next end when one is full', () => {
    let round = newRound(preset, {}, 1000);
    for (const label of ['10', '9', '9', 'X']) round = addArrow(round, arrowFromLabel(label));
    expect(round.ends.map((end) => end.length)).toEqual([3, 1]);
    expect(completedEnds(round)).toBe(1);
    expect(roundTotals(round.ends)).toMatchObject({ arrows: 4, total: 38, tens: 2, xs: 1, running: [28, 38] });
    round = undoArrow(undoArrow(round));
    expect(round.ends.map((end) => end.length)).toEqual([2]);
  });

  it('is complete after its planned ends', () => {
    let round = newRound(preset, { ends: 2 });
    for (let i = 0; i < 6; i += 1) round = addArrow(round, arrowFromLabel('8'));
    expect(isComplete(round)).toBe(true);
    expect(maxRoundScore(preset)).toBe(600);
  });

  it('becomes a practice log entry with its arrows', () => {
    let round = newRound(roundById('practice'), { distanceM: 30, arrowsPerEnd: 3 }, 5000);
    for (const label of ['10', '8', 'M']) round = addArrow(round, arrowFromLabel(label));
    const entry = entryFromRound(round, '  windy ');
    expect(entry).toMatchObject({ id: round.id, source: 'round', date: 5000, arrows: 3, totalScore: 18, scoredArrows: 3, distanceM: 30, notes: 'windy' });
    expect(entry.averageScore).toBeCloseTo(6);
    expect(entry.round?.ends).toHaveLength(1);
    expect(isScoredRound(round)).toBe(true);
    expect(isScoredRound({ id: 'x' })).toBe(false);
  });

  it('has a valid face for every preset', () => {
    for (const item of ROUNDS) expect(faceById(item.faceId).id).toBe(item.faceId);
  });
});

describe('grouping', () => {
  it('needs three placed arrows', () => {
    expect(grouping([arrowAt(0, 0, 'full'), arrowAt(0.1, 0, 'full'), arrowFromLabel('9')])).toBeNull();
  });

  it('finds the centre, size and direction of a group', () => {
    const arrows = [arrowAt(-0.3, -0.3, 'full'), arrowAt(-0.2, -0.3, 'full'), arrowAt(-0.3, -0.2, 'full'), arrowAt(-0.2, -0.2, 'full')];
    const group = grouping(arrows)!;
    expect(group.centre.x).toBeCloseTo(-0.25);
    expect(group.centre.y).toBeCloseTo(-0.25);
    expect(group.extremeSpread).toBeCloseTo(Math.hypot(0.1, 0.1));
    expect(group.direction).toBe('high left');
    expect(toCm(group.extremeSpread, faceById('122-full'))).toBeCloseTo(Math.hypot(0.1, 0.1) * 61);
    expect(groupingHints(group.direction).length).toBeGreaterThan(1);
  });

  it('describes positions in plain words', () => {
    expect(directionOf({ x: 0.02, y: 0.03 })).toBe('centred');
    expect(directionOf({ x: -0.4, y: 0.05 })).toBe('left');
    expect(directionOf({ x: 0.05, y: 0.4 })).toBe('low');
    expect(groupingHints('centred')).toEqual([]);
    // Mirrored for a left-handed archer: their "left" reads like a right-hander's "right".
    expect(groupingHints('left', 'left')[0]).toMatch(/torquing/);
  });
});

describe('end timer', () => {
  it('walks up, shoots, warns and stops', () => {
    expect(timerState(0, 120)).toEqual({ phase: 'walk-up', remaining: 10 });
    expect(timerState(10_000, 120)).toEqual({ phase: 'shoot', remaining: 120 });
    expect(timerState(100_500, 120)).toEqual({ phase: 'warning', remaining: 30 });
    expect(timerState(131_000, 120)).toEqual({ phase: 'stop', remaining: 0 });
    expect(beepsFor('walk-up')).toBe(2);
    expect(beepsFor('shoot')).toBe(1);
    expect(beepsFor('stop')).toBe(3);
    expect(formatClock(125)).toBe('2:05');
  });
});
