import type { CategoryId } from '../video-analysis/types';

/**
 * Drill programs: guided, timed exercises for each area of form. Each drill
 * repeats work and rest intervals; the athlete follows the prompts.
 */

export interface Drill {
  id: string;
  name: string;
  /** The form areas it helps (video analysis categories). */
  areas: CategoryId[];
  equipment: string;
  summary: string;
  steps: string[];
  reps: number;
  workS: number;
  restS: number;
  /** What to call the work interval, e.g. "Hold". */
  workLabel: string;
  safety?: string;
}

export const DRILLS: readonly Drill[] = [
  {
    id: 'hold-at-anchor', name: 'Holding at anchor', areas: ['stability', 'alignment'], equipment: 'Your bow (no arrow) or a stretch band',
    summary: 'Builds the strength to stay still at full draw.',
    steps: ['Stand side-on with your normal stance.', 'Draw to anchor and hold with the bow arm extended and the shoulders down.', 'Keep pulling through gently with the back, not the arm.', 'Let down slowly under control when the rest starts.'],
    reps: 6, workS: 20, restS: 40, workLabel: 'Hold',
    safety: 'Never dry-fire a bow. Use a stretch band if you are not sure you can let down safely.',
  },
  {
    id: 'reversals', name: 'Reversals (SPT)', areas: ['stability', 'release'], equipment: 'Your bow (no arrow) or a stretch band',
    summary: 'Short, repeated holds for endurance and a steady expansion.',
    steps: ['Draw to anchor.', 'Hold and expand slightly through the shot.', 'Let down, rest, and repeat.'],
    reps: 10, workS: 7, restS: 7, workLabel: 'Hold',
    safety: 'Never dry-fire a bow.',
  },
  {
    id: 'blank-bale', name: 'Blank bale', areas: ['release', 'followThrough', 'rhythm'], equipment: 'A target boss with no face, at 3 to 5 m',
    summary: 'Shooting with your eyes on the shot, not the score.',
    steps: ['Stand close to a blank boss.', 'Shoot with your eyes closed or fixed on the boss.', 'Feel the release and hold the follow-through until the arrow lands.'],
    reps: 6, workS: 30, restS: 30, workLabel: 'Shoot',
  },
  {
    id: 'follow-through-freeze', name: 'Follow-through freeze', areas: ['followThrough', 'release'], equipment: 'Bow and arrows',
    summary: 'Keeps the bow arm up and the draw hand moving back after the release.',
    steps: ['Shoot an arrow as normal.', 'After the release, freeze: bow arm up, draw hand by the neck.', 'Count the hold before relaxing.'],
    reps: 6, workS: 5, restS: 25, workLabel: 'Freeze',
  },
  {
    id: 'posture-wall', name: 'Posture at the wall', areas: ['posture', 'alignment'], equipment: 'A wall',
    summary: 'Teaches a tall, neutral back and low shoulders.',
    steps: ['Stand with your back, shoulders and head against a wall.', 'Raise your bow arm to shoulder height without lifting the shoulder.', 'Breathe slowly and keep the ribs down.'],
    reps: 4, workS: 30, restS: 20, workLabel: 'Hold',
  },
  {
    id: 'shot-rhythm', name: 'Rhythm count', areas: ['rhythm'], equipment: 'Bow and arrows',
    summary: 'Shoots every arrow to the same count so the timing becomes automatic.',
    steps: ['Pick a count (for example: set, draw 2 s, anchor, aim 3 s, release).', 'Shoot each arrow to the same count.', 'Let down if the shot runs past the count.'],
    reps: 6, workS: 12, restS: 30, workLabel: 'Shoot',
  },
];

export function drillById(id: string): Drill | null {
  return DRILLS.find((drill) => drill.id === id) ?? null;
}

/** Drills for a form area, best matches first. */
export function drillsFor(area: CategoryId | null | undefined): Drill[] {
  if (!area) return [...DRILLS];
  return [...DRILLS].sort((a, b) => Number(b.areas[0] === area) * 2 + Number(b.areas.includes(area)) - (Number(a.areas[0] === area) * 2 + Number(a.areas.includes(area))));
}

export type DrillPhase = 'ready' | 'work' | 'rest' | 'done';
export interface DrillState { phase: DrillPhase; rep: number; remaining: number }

export const READY_S = 5;

/** Where a drill is after `elapsedMs`: a short get-ready, then work and rest for each rep (no rest after the last). */
export function drillState(drill: Pick<Drill, 'reps' | 'workS' | 'restS'>, elapsedMs: number): DrillState {
  let t = Math.max(0, elapsedMs) / 1000;
  if (t < READY_S) return { phase: 'ready', rep: 1, remaining: Math.ceil(READY_S - t) };
  t -= READY_S;
  for (let rep = 1; rep <= drill.reps; rep += 1) {
    if (t < drill.workS) return { phase: 'work', rep, remaining: Math.ceil(drill.workS - t) };
    t -= drill.workS;
    if (rep === drill.reps) break;
    if (t < drill.restS) return { phase: 'rest', rep, remaining: Math.ceil(drill.restS - t) };
    t -= drill.restS;
  }
  return { phase: 'done', rep: drill.reps, remaining: 0 };
}

export function drillDurationS(drill: Pick<Drill, 'reps' | 'workS' | 'restS'>): number {
  return READY_S + drill.reps * drill.workS + (drill.reps - 1) * drill.restS;
}
