import type { BowType, CameraViewKind, FramePhase, SkillLevel } from './types';

export const VIEW_LABEL: Record<CameraViewKind, string> = {
  broadside: 'Side-on',
  oblique: 'Angled',
  'down-the-line': 'Down the line',
  unknown: 'Unclear',
};

export const PHASE_LABEL: Record<FramePhase, string> = {
  idle: 'Between shots',
  draw: 'Draw',
  anchor: 'Anchor & aim',
  release: 'Release',
  'follow-through': 'Follow-through',
};

export const BOW_LABEL: Record<BowType, string> = {
  recurve: 'Recurve',
  compound: 'Compound',
  barebow: 'Barebow',
  traditional: 'Traditional',
  unknown: 'Not set',
};

export const SHORT_LEVEL: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
};

/** 75.4 → "1:15.4" */
export function formatClock(seconds: number, decimals = 1): string {
  if (!Number.isFinite(seconds)) return '–';
  const sign = seconds < 0 ? '-' : '';
  const value = Math.abs(seconds);
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  const secondsText = rest.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, '0');
  return `${sign}${minutes}:${secondsText}`;
}

export function formatSeconds(seconds: number | null | undefined, decimals = 1): string {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? `${seconds.toFixed(decimals)} s` : '–';
}

export function scoreTone(score: number | null | undefined): 'good' | 'ok' | 'low' {
  if (typeof score !== 'number') return 'ok';
  return score >= 80 ? 'good' : score >= 58 ? 'ok' : 'low';
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDate(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(epochMs).toISOString().slice(0, 16).replace('T', ' ');
  }
}
