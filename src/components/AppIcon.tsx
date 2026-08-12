import type { ReactNode, SVGProps } from 'react';

export type AppIconName =
  | 'home'
  | 'plus'
  | 'calibration'
  | 'camera'
  | 'grid'
  | 'devices'
  | 'shield'
  | 'sensors'
  | 'arrow-right'
  | 'undo'
  | 'trash'
  | 'smartphone'
  | 'tablet'
  | 'scan'
  | 'close'
  | 'chevron-down'
  | 'arrow-left'
  | 'play'
  | 'pause'
  | 'skip-prev'
  | 'skip-next'
  | 'target'
  | 'play-circle'
  | 'history'
  | 'accessibility'
  | 'check'
  | 'stop'
  | 'refresh'
  | 'unknown';

const iconPaths: Record<AppIconName, ReactNode> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.5Z" />
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  calibration: (
    <>
      <path d="M5 12h3l2-4 4 8 2-4h3" />
      <path d="M5 17h14" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <circle cx="12" cy="12" r="3.25" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="4" rx="1" />
      <rect x="14.5" y="12.5" width="6" height="8" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
    </>
  ),
  devices: (
    <>
      <rect x="7" y="2.75" width="10" height="16" rx="2.25" />
      <path d="M10 19h4" />
      <path d="M3.5 6.5h3v8h-3a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 3.5 6.5Z" />
      <path d="M20.5 9.5h-3v8h3a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 20.5 9.5Z" />
    </>
  ),
  shield: (
    <path d="M12 3.5 18.5 6v5.5c0 4-2.6 7.7-6.5 9.5-3.9-1.8-6.5-5.5-6.5-9.5V6L12 3.5Z" />
  ),
  sensors: (
    <>
      <path d="M7 17V9.5A5 5 0 0 1 12 4.5a5 5 0 0 1 5 5V17" />
      <path d="M9 17v-5.5M15 17v-3.5M12 21v-2" />
      <path d="M3 12h3M18 12h3" />
    </>
  ),
  'arrow-right': (
    <path d="M5 12h14M13 5l7 7-7 7" />
  ),
  undo: (
    <path d="M9 7H5v4M5 7c2.2-2.2 5.4-3 8.5-1.5A7.5 7.5 0 1 1 6.8 16.2" />
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7l1 12h8l1-12" />
    </>
  ),
  smartphone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10 18h4" />
    </>
  ),
  tablet: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
      <path d="M10 18h4" />
    </>
  ),
  scan: (
    <>
      <path d="M3 9V6a3 3 0 0 1 3-3h3M21 9V6a3 3 0 0 0-3-3h-3M3 15v3a3 3 0 0 0 3 3h3M21 15v3a3 3 0 0 1-3 3h-3" />
      <path d="M9 12h6" />
    </>
  ),
  close: (
    <path d="M6 6l12 12M18 6 6 18" />
  ),
  'chevron-down': (
    <path d="m6 9 6 6 6-6" />
  ),
  'arrow-left': (
    <path d="M19 12H5M11 5l-7 7 7 7" />
  ),
  play: (
    <path d="m8 5 11 7-11 7V5Z" />
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  'skip-prev': (
    <>
      <path d="M7 6v12M17 6 9 12l8 6V6Z" />
    </>
  ),
  'skip-next': (
    <>
      <path d="M17 6v12M7 6l8 6-8 6V6Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  'play-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4V8Z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),  accessibility: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M9.5 10.5c1.3-.8 3.7-.8 5 0l1.5 1.2c.8.7.6 1.9-.4 2.3l-1.5.6v3.4h-3.2v-3.4l-1.5-.6c-1-.4-1.2-1.6-.4-2.3l1.5-1.2Z" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2 5" />
    </>
  ),
  unknown: (
    <circle cx="12" cy="12" r="9" />
  ),
};

type AppIconProps = SVGProps<SVGSVGElement> & {
  name: AppIconName;
  size?: number;
};

export function AppIcon({ name, size = 20, ...props }: AppIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {iconPaths[name] ?? iconPaths.unknown}
    </svg>
  );
}
