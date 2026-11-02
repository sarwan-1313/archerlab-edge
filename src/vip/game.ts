/**
 * "Wind Challenge": a small aiming game for VIP mode. You aim through the
 * sight at a 10-ring face; the longer you hold at full draw the more the pin
 * wobbles, and the wind pushes the arrow. Everything here is pure so it can be
 * tested; the page draws it.
 */

export type Level = 'indoor' | 'outdoor' | 'olympic';

export const LEVELS: Record<Level, { label: string; distanceM: number; maxWind: number; spread: number; arrows: number }> = {
  indoor: { label: '18 m indoor', distanceM: 18, maxWind: 0, spread: 0.025, arrows: 6 },
  outdoor: { label: '50 m breeze', distanceM: 50, maxWind: 0.18, spread: 0.04, arrows: 6 },
  olympic: { label: '70 m gusty', distanceM: 70, maxWind: 0.32, spread: 0.055, arrows: 6 },
};

/** A small seeded random generator (mulberry32), so a round can be replayed in tests. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Vec { x: number; y: number }

/** Wind for an arrow: how far it pushes the arrow on the face (face units), and its strength in km/h for display. */
export function windFor(level: Level, random: () => number): { push: Vec; kmh: number; fromDeg: number } {
  const max = LEVELS[level].maxWind;
  if (!max) return { push: { x: 0, y: 0 }, kmh: 0, fromDeg: 0 };
  const strength = 0.25 + random() * 0.75;
  const angle = random() * Math.PI * 2;
  return { push: { x: Math.cos(angle) * max * strength, y: Math.sin(angle) * max * strength * 0.5 }, kmh: Math.round(strength * (level === 'olympic' ? 28 : 16)), fromDeg: Math.round((angle * 180) / Math.PI + 180) % 360 };
}

/**
 * How far the sight pin drifts after holding for `holdS` seconds: steady for
 * the first few seconds, then growing as the archer tires. Smooth, so it can be
 * drawn every frame.
 */
export function wobble(holdS: number, phase = 0): Vec {
  const amplitude = 0.012 + (holdS > 3 ? 0.03 * (holdS - 3) ** 1.4 : 0);
  const t = holdS + phase;
  return {
    x: amplitude * (Math.sin(t * 1.7) + 0.6 * Math.sin(t * 3.1 + 1.3)),
    y: amplitude * (Math.cos(t * 1.3) + 0.5 * Math.sin(t * 2.6 + 0.4)),
  };
}

/** Where the arrow lands: the pin's position at release, pushed by the wind, plus the archer's natural spread. */
export function impact(aim: Vec, holdS: number, wind: Vec, level: Level, random: () => number, phase = 0): Vec {
  const drift = wobble(holdS, phase);
  const spread = LEVELS[level].spread;
  // A short, jerky shot (released before settling) spreads more.
  const rushed = holdS < 1 ? 2 : 1;
  const r = Math.sqrt(random()) * spread * rushed;
  const a = random() * Math.PI * 2;
  return { x: aim.x + drift.x + wind.x + r * Math.cos(a), y: aim.y + drift.y + wind.y + r * Math.sin(a) };
}

/** Points for a round: the arrow scores, plus a bonus for groups (the tighter, the more). */
export function roundBonus(points: readonly Vec[]): number {
  if (points.length < 3) return 0;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const spread = points.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / points.length;
  return spread < 0.05 ? 10 : spread < 0.1 ? 5 : spread < 0.15 ? 2 : 0;
}

export const BEST_KEY = 'archerlab-edge:vip-game-best';

/** The same seed for everyone on the same day (UTC date, e.g. "2026-11-03"), for the daily challenge. */
export function dailySeed(date: string): number {
  let hash = 2166136261;
  for (let index = 0; index < date.length; index += 1) hash = Math.imul(hash ^ date.charCodeAt(index), 16777619);
  return hash >>> 0;
}
