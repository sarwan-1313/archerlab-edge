import type { Metric, NavItem, PageKey } from '../types';

export const navItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'new-session', label: 'New Session', icon: 'plus' },
  { key: 'calibration', label: 'Calibration', icon: 'calibration' },
  { key: 'live-analysis', label: 'Live Analysis', icon: 'camera' },
  { key: 'manual-shot-entry', label: 'Manual Entry', icon: 'target' },
  { key: 'replay-analysis', label: 'Replay', icon: 'play-circle' },
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'multi-camera', label: 'Multi-Camera', icon: 'devices' },
  { key: 'gesture-guide', label: 'Gesture Guide', icon: 'accessibility' },
  { key: 'saved-recordings', label: 'Recordings', icon: 'play-circle' },
  { key: 'profile', label: 'Profile', icon: 'accessibility' },
];


export const desktopNavItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'live-analysis', label: 'Analysis', icon: 'camera' },
  { key: 'home', label: 'Sessions', icon: 'home' },
  { key: 'new-session', label: 'New Session', icon: 'plus' },
];

export const mobileNavItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'new-session', label: 'New Session', icon: 'plus' },
  { key: 'live-analysis', label: 'Analysis', icon: 'camera' },
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
];

export const topMetrics: Metric[] = [
  { label: 'Total Shots', value: '184', detail: '+12 this block' },
  { label: 'Accuracy', value: '89.4%', detail: '+3.1%' },
  { label: 'Draw Stability', value: '96%', detail: 'Excellent' },
  { label: 'Release Timing', value: '11.3ms', detail: 'within range' },
];

export const liveMetrics: Metric[] = [
  { label: 'Shoulder Alignment', value: '91%', tone: 'primary' },
  { label: 'Bow Arm Stability', value: '87%', tone: 'secondary' },
  { label: 'Release Consistency', value: '84%', tone: 'warning' },
  { label: 'Brace Height', value: '6.2 cm', tone: 'neutral' },
];

export const sessionDetails = [
  { label: 'Environment', value: 'Outdoor range' },
  { label: 'Bow type', value: 'Recurve' },
  { label: 'Archer profile', value: 'Elite Archer' },
  { label: 'Wind', value: '3.4 m/s' },
];

export const shotHistory = [
  { id: 'A-142', score: 10, outcome: 'Bullseye', time: '00:02:14' },
  { id: 'A-143', score: 9, outcome: 'Inner 9', time: '00:02:31' },
  { id: 'A-144', score: 8, outcome: 'Good line', time: '00:02:48' },
  { id: 'A-145', score: 10, outcome: 'Bullseye', time: '00:03:11' },
  { id: 'A-146', score: 7, outcome: 'Wobble', time: '00:03:27' },
];

export const pageTitles: Record<PageKey, string> = {
  home: 'Home',
  'new-session': 'New Session',
  calibration: 'Calibration',
  'live-analysis': 'Analysis',
  'manual-shot-entry': 'Manual Entry',
  'replay-analysis': 'Replay',
  dashboard: 'Dashboard',
  'multi-camera': 'Multi-Camera',
  'gesture-guide': 'Gesture Guide',
  'saved-recordings': 'Recordings',
  profile: 'Profile',
};
