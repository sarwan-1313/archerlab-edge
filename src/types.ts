import type { AppIconName } from './components/AppIcon';
import type { ArcherHandedness, CameraView } from './types/biomechanics';

export type PageKey =
  | 'home'
  | 'new-session'
  | 'calibration'
  | 'live-analysis'
  | 'manual-shot-entry'
  | 'replay-analysis'
  | 'dashboard'
  | 'multi-camera';

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

export type SessionConfiguration = { handedness: ArcherHandedness; cameraView: CameraView };
