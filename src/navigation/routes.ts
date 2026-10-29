import type { PageKey } from '../types';

export const PAGE_PATHS = {
  home: '/',
  'new-session': '/camera',
  calibration: '/readiness',
  'live-analysis': '/analysis',
  'video-analysis': '/video',
  'manual-shot-entry': '/manual-shot-entry',
  'replay-analysis': '/replay-analysis',
  dashboard: '/analytics',
  'multi-camera': '/multi-camera',
  'gesture-guide': '/gesture-guide',
  'user-guide': '/guide',
  'guide-start-analysis': '/guide/start-analysis',
  'guide-camera-setup': '/guide/camera-setup',
  'guide-readiness': '/guide/readiness',
  'guide-start-session': '/guide/start-session',
  'guide-perform-shots': '/guide/perform-shots',
  'guide-record-scores': '/guide/record-scores',
  'guide-review-shots': '/guide/review-shots',
  'guide-end-session': '/guide/end-session',
  'guide-session-summary': '/guide/session-summary',
  'guide-analytics': '/guide/analytics',
  'saved-recordings': '/sessions',
  profile: '/profile',
  training: '/training',
  privacy: '/privacy',
} as const satisfies Readonly<Record<PageKey, string>>;

const PAGE_BY_PATH = new Map<string, PageKey>(
  [
    ...(Object.entries(PAGE_PATHS) as Array<[PageKey, string]>).map(([page, path]) => [path, page] as [string, PageKey]),
    ['/new-session', 'new-session'],
    ['/calibration', 'calibration'],
  ],
);

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

export function routeForPage(page: PageKey, params?: { shotId?: string; reportId?: string }): string {
  const path = PAGE_PATHS[page];
  if (page === 'replay-analysis' && params?.shotId) {
    return `${path}?shot=${encodeURIComponent(params.shotId)}`;
  }
  // A video report shared with a coach, opened from the cloud.
  if (page === 'video-analysis' && params?.reportId) {
    return `${path}?report=${encodeURIComponent(params.reportId)}`;
  }
  return path;
}

export function readReportParam(search: string): string | undefined {
  return new URLSearchParams(search).get('report') || undefined;
}

export function resolvePageFromPathname(pathname: string): PageKey | undefined {
  return PAGE_BY_PATH.get(normalizePathname(pathname));
}

export function pageForPathname(pathname: string): PageKey {
  return resolvePageFromPathname(pathname) ?? 'home';
}
