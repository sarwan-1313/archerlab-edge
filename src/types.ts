import type { AppIconName } from './components/AppIcon';
import type { ArcherHandedness, CameraView } from './types/biomechanics';
import type { ScoreEntryMethod } from './types/gestureScore';

export type PageKey =
  | 'home'
  | 'new-session'
  | 'calibration'
  | 'live-analysis'
  | 'manual-shot-entry'
  | 'replay-analysis'
  | 'dashboard'
  | 'multi-camera'
  | 'gesture-guide';

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
