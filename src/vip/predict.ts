import type { PracticeEntry } from '../practice-log/types';

export interface Prediction {
  round: string;
  rounds: number;
  /** Predicted total for the next round, from the trend of recent rounds. */
  predicted: number;
  best: number;
  /** Average change per round over the recent rounds. */
  trendPerRound: number;
  max: number;
}

/** Predicts the next score of the round shot most often, from a straight-line trend through its last ten rounds. Needs three rounds. */
export function predictNextRound(entries: readonly PracticeEntry[]): Prediction | null {
  const rounds = entries.filter((entry) => entry.source === 'round' && entry.round && entry.totalScore !== null);
  const groups = new Map<string, PracticeEntry[]>();
  for (const entry of rounds) {
    const key = `${entry.round!.name}|${entry.arrows}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const busiest = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  if (!busiest || busiest.length < 3) return null;
  const recent = [...busiest].sort((a, b) => a.date - b.date).slice(-10);
  const ys = recent.map((entry) => entry.totalScore!);
  const n = ys.length;
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let num = 0; let den = 0;
  ys.forEach((y, x) => { num += (x - meanX) * (y - meanY); den += (x - meanX) ** 2; });
  const slope = den ? num / den : 0;
  const max = recent[0].arrows * 10;
  const predicted = Math.round(Math.max(0, Math.min(max, meanY + slope * (n - meanX))));
  return { round: recent[0].round!.name, rounds: busiest.length, predicted, best: Math.max(...busiest.map((entry) => entry.totalScore!)), trendPerRound: slope, max };
}
