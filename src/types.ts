import type { AppIconName } from './components/AppIcon';
import type { ArcherHandedness, CameraView } from './types/biomechanics';
import type { ScoreEntryMethod } from './types/gestureScore';

export type GuideDetailPageKey =
  | 'guide-start-analysis'
  | 'guide-camera-setup'
  | 'guide-readiness'
  | 'guide-start-session'
  | 'guide-perform-shots'
  | 'guide-record-scores'
  | 'guide-review-shots'
  | 'guide-end-session'
  | 'guide-session-summary'
  | 'guide-analytics';

export type PageKey =
  | 'home'
  | 'new-session'
  | 'calibration'
  | 'live-analysis'
  | 'manual-shot-entry'
  | 'replay-analysis'
  | 'dashboard'
  | 'multi-camera'
  | 'gesture-guide'
  | 'user-guide'
  | 'saved-recordings'
  | 'profile'
  | GuideDetailPageKey;

export type NavItem = {
  key: PageKey;
  label: string;
  icon: AppIconName;
};

export type Metric = {
  label: string;
  value: string;
  detail?: string;
  tone?: 'primary' | 'secondary' | 'warning' | 'neutral';
};

export type SessionConfiguration = { handedness: ArcherHandedness; cameraView: CameraView; scoreEntryMethod: ScoreEntryMethod; shotCaptureMethod: 'manual' | 'experimental-auto-confirm'; };
