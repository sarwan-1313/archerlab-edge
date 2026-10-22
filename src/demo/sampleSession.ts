/**
 * Sample session for visitors without a camera or bow. Synthetic pose frames
 * are fed through the real ShotCaptureEngine, so every metric shown on
 * Analytics and Replay is genuine engine output, not hard-coded numbers.
 */
import { ShotCaptureEngine } from '../shot-analysis/shotCapture';
import { scoreTargetCoordinate } from '../target/targetGeometry';
import type { ShotAnalysis, ShotFrame } from '../types/shotAnalysis';

export const SAMPLE_SHOT_PREFIX = 'sample-';

export function isSampleShot(shot: Pick<ShotAnalysis, 'id'>): boolean {
  return shot.id.startsWith(SAMPLE_SHOT_PREFIX);
}

// Small deterministic PRNG so the sample looks the same on every visit.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Form quality per shot: 0 = textbook, 1 = scrappy. Scores follow form, loosely.
const SHOT_FORM = [0.15, 0.3, 0.1, 0.55, 0.2, 0.75, 0.25, 0.12, 0.45, 0.9, 0.18, 0.35];

function frameAt(timestampMs: number, form: number, releaseMs: number, rand: () => number): ShotFrame {
  const sinceRelease = timestampMs - releaseMs;
  // Body sway is slow and smooth (two low-frequency waves) with a little sensor noise on top.
  const wave = (period: number, offset: number) => Math.sin(timestampMs / period + offset + form * 7);
  const jitter = (scale: number) => (wave(310, 0) * 0.65 + wave(170, 1.7) * 0.35) * scale + (rand() - 0.5) * scale * 0.18;
  const sway = 0.4 + form * 2.6;
  const released = sinceRelease > 0;
  const followThrough = released ? Math.min(1, sinceRelease / 300) : 0;
  return {
    timestampMs,
    athleteDetected: true,
    poseConfidence: 0.92 - form * 0.08,
    shoulderLineAngleDeg: 1.5 + jitter(sway) + (released ? form * 3 * followThrough : 0),
    bowArmElbowAngleDeg: 172 - form * 4 + jitter(sway * 0.8) - (released ? form * 6 * followThrough : 0),
    torsoLeanDeg: 0.8 + form * 2 + jitter(sway * 0.4),
    headMotion: 0.4 + form * 2.4 + Math.abs(jitter(0.6)) + (released ? form * 3 * followThrough : 0),
    bowHandMotion: 0.6 + form * 3.2 + Math.abs(jitter(0.8)) + (released ? (2 + form * 6) * followThrough : 0),
    shoulderVariationDeg: 0.3 + form * 1.8 + Math.abs(jitter(0.4)),
    headPosition: { x: 0.485 + jitter(0.002 + form * 0.006), y: 0.235 + jitter(0.002) },
    bowWristPosition: { x: 0.67 + jitter(0.003 + form * 0.008), y: 0.328 + (released ? form * 0.04 * followThrough : 0) },
    drawWristPosition: { x: released ? 0.478 - 0.05 * followThrough : 0.478 + jitter(0.003), y: 0.262 + jitter(0.002) },
    drawElbowPosition: { x: 0.385 + jitter(0.003), y: 0.322 + jitter(0.003) },
    shoulderMidpoint: { x: 0.472, y: 0.333 },
    shoulderWidth: 0.12,
    landmarkQuality: 0.94 - form * 0.06,
  };
}

function captureShot(index: number, form: number, rand: () => number): ShotAnalysis | null {
  const engine = new ShotCaptureEngine('right');
  engine.arm();
  const releaseMs = 4000 + index * 15000;
  let shot: ShotAnalysis | null = null;
  for (let t = releaseMs - 1800; t <= releaseMs; t += 50) engine.ingest(frameAt(t, form, releaseMs, rand));
  if (!engine.markRelease(releaseMs, 'manual').ok) return null;
  for (let t = releaseMs + 50; t <= releaseMs + 2000 && !shot; t += 50) shot = engine.ingest(frameAt(t, form, releaseMs, rand)) ?? engine.advance(t);
  return shot;
}

export function createSampleSession(now = Date.now()): ShotAnalysis[] {
  const rand = random(1313);
  const startedAt = now - SHOT_FORM.length * 45_000;
  return SHOT_FORM.flatMap((form, index) => {
    const shot = captureShot(index, form, rand);
    if (!shot) return [];
    // Arrow lands farther from the centre as form degrades.
    const radius = Math.min(0.62, 0.01 + form * 0.4 + rand() * 0.07);
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const { score, isX } = scoreTargetCoordinate(x, y);
    const capturedAt = startedAt + index * 45_000;
    return [{
      ...shot,
      id: `${SAMPLE_SHOT_PREFIX}${String(index + 1).padStart(2, '0')}`,
      capturedAt,
      actualResult: { score, isX, source: 'manual-target' as const, capturedAt: capturedAt + 8000, targetX: x, targetY: y },
    }];
  });
}
