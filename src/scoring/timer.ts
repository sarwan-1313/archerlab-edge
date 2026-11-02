/**
 * The end timer used at competitions: a short walk-up to the line on red,
 * then green while shooting, amber for the last 30 seconds, and red when time
 * is up.
 */

export const WALK_UP_S = 10;
export const WARNING_S = 30;

export type TimerPhase = 'walk-up' | 'shoot' | 'warning' | 'stop';

export interface TimerState {
  phase: TimerPhase;
  /** Seconds left in the current phase, rounded up; 0 once stopped. */
  remaining: number;
}

export function timerState(elapsedMs: number, secondsPerEnd: number, walkUpS = WALK_UP_S): TimerState {
  const elapsed = Math.max(0, elapsedMs) / 1000;
  if (elapsed < walkUpS) return { phase: 'walk-up', remaining: Math.ceil(walkUpS - elapsed) };
  const left = secondsPerEnd - (elapsed - walkUpS);
  if (left <= 0) return { phase: 'stop', remaining: 0 };
  return { phase: left <= Math.min(WARNING_S, secondsPerEnd / 2) ? 'warning' : 'shoot', remaining: Math.ceil(left) };
}

export const PHASE_LABEL: Record<TimerPhase, string> = { 'walk-up': 'Walk to the line', shoot: 'Shoot', warning: '30 seconds left', stop: 'Stop shooting' };

/** Beeps when a phase starts, as the whistle signals at World Archery events: two to walk up, one to start shooting, three to stop. The amber warning is silent. */
export function beepsFor(phase: TimerPhase): number {
  return phase === 'walk-up' ? 2 : phase === 'shoot' ? 1 : phase === 'stop' ? 3 : 0;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
