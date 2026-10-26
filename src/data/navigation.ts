import type { NavItem, PageKey } from '../types';

export const desktopNavItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'live-analysis', label: 'Live Analysis', icon: 'camera' },
  { key: 'video-analysis', label: 'Video Analysis', icon: 'film' },
  { key: 'saved-recordings', label: 'Sessions', icon: 'history' },
  { key: 'dashboard', label: 'Analytics', icon: 'grid' },
  { key: 'user-guide', label: 'Guide', icon: 'accessibility' },
];

// Guide stays one tap away from Home; the phone bar favours the two analysis engines.
export const mobileNavItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'video-analysis', label: 'Video', icon: 'film' },
  { key: 'live-analysis', label: 'Live', icon: 'camera' },
  { key: 'dashboard', label: 'Analytics', icon: 'grid' },
  { key: 'saved-recordings', label: 'Sessions', icon: 'history' },
];

export const pageTitles: Record<PageKey, string> = {
  home: 'Home',
  'new-session': 'New Session',
  calibration: 'Calibration',
  'live-analysis': 'Analysis',
  'video-analysis': 'Video Analysis',
  'manual-shot-entry': 'Manual Entry',
  'replay-analysis': 'Replay',
  dashboard: 'Dashboard',
  'multi-camera': 'Multi-Camera',
  'gesture-guide': 'Gesture Guide',
  'user-guide': 'User Guide',
  'guide-start-analysis': 'Start Analysis Guide',
  'guide-camera-setup': 'Camera Setup Guide',
  'guide-readiness': 'Readiness Guide',
  'guide-start-session': 'Start Session Guide',
  'guide-perform-shots': 'Perform Shots Guide',
  'guide-record-scores': 'Record Scores Guide',
  'guide-review-shots': 'Review Shots Guide',
  'guide-end-session': 'End Session Guide',
  'guide-session-summary': 'Session Summary Guide',
  'guide-analytics': 'Analytics Guide',
  'saved-recordings': 'Recordings',
  profile: 'Profile',
};
