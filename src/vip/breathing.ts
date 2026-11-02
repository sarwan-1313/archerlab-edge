/**
 * Box breathing before a shot or a competition end: breathe in, hold, out,
 * hold, each for the same count. Pure so it can be tested; the page animates it.
 */

export type BreathStep = 'in' | 'hold-full' | 'out' | 'hold-empty';
export const STEP_LABEL: Record<BreathStep, string> = { in: 'Breathe in', 'hold-full': 'Hold', out: 'Breathe out', 'hold-empty': 'Hold' };
const ORDER: BreathStep[] = ['in', 'hold-full', 'out', 'hold-empty'];

export interface BreathState { step: BreathStep; cycle: number; secondsLeft: number; done: boolean }

export function breathState(elapsedS: number, stepS = 4, cycles = 4): BreathState {
  const t = Math.max(0, elapsedS);
  const cycleS = stepS * ORDER.length;
  const cycle = Math.floor(t / cycleS);
  if (cycle >= cycles) return { step: 'hold-empty', cycle: cycles, secondsLeft: 0, done: true };
  const within = t - cycle * cycleS;
  const index = Math.floor(within / stepS);
  return { step: ORDER[index], cycle: cycle + 1, secondsLeft: Math.ceil(stepS - (within - index * stepS)), done: false };
}
