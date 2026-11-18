import type { NavItem, PageKey } from '../types';

// Grouped, so the sidebar reads as a few short lists instead of one long one.
export const desktopNavItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'live-analysis', label: 'Live Analysis', icon: 'camera', group: 'analyse' },
  { key: 'video-analysis', label: 'Video Analysis', icon: 'film', group: 'analyse' },
  { key: 'training', label: 'Training', icon: 'calendar', group: 'practice' },
  { key: 'scoring', label: 'Scoring', icon: 'target', group: 'practice' },
  { key: 'saved-recordings', label: 'Sessions', icon: 'history', group: 'progress' },
  { key: 'dashboard', label: 'Analytics', icon: 'grid', group: 'progress' },
  { key: 'ranges', label: 'Find a range', icon: 'map', group: 'explore' },
  { key: 'community', label: 'Community', icon: 'share', group: 'explore' },
  { key: 'user-guide', label: 'Guide', icon: 'accessibility', group: 'help' },
];

// The phone bar keeps the four things done most; everything else is one tap away under More.
export const mobileNavItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'video-analysis', label: 'Video', icon: 'film' },
  { key: 'live-analysis', label: 'Live', icon: 'camera' },
  { key: 'dashboard', label: 'Analytics', icon: 'grid' },
];

/** The phone's More menu: every page that is not on the bottom bar. */
export const moreNavItems: NavItem[] = [
  { key: 'training', label: 'Training log', icon: 'calendar', group: 'practice' },
  { key: 'scoring', label: 'Scoring', icon: 'target', group: 'practice' },
  { key: 'drills', label: 'Drills', icon: 'play-circle', group: 'practice' },
  { key: 'equipment', label: 'Equipment', icon: 'sensors', group: 'practice' },
  { key: 'saved-recordings', label: 'Sessions', icon: 'history', group: 'progress' },
  { key: 'ranges', label: 'Find a range', icon: 'map', group: 'explore' },
  { key: 'club', label: 'My club', icon: 'user', group: 'explore' },
  { key: 'community', label: 'Community', icon: 'share', group: 'explore' },
  { key: 'user-guide', label: 'Guide', icon: 'accessibility', group: 'help' },
  { key: 'profile', label: 'Profile', icon: 'user', group: 'help' },
  { key: 'privacy', label: 'Privacy', icon: 'shield', group: 'help' },
];

export const navGroupLabels: Record<NonNullable<NavItem['group']>, string> = {
  analyse: 'Analyse',
  practice: 'Practice',
  progress: 'Progress',
  explore: 'Explore',
  help: 'Help & account',
};

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
  privacy: 'Privacy',
  training: 'Training',
  scoring: 'Scoring',
  drills: 'Drills',
  equipment: 'Equipment',
  ranges: 'Find a range',
  vip: 'VIP Lounge',
  club: 'My club',
  community: 'Community',
  'dataset-tools': 'Dataset tools',
};
