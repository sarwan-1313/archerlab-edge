import type { PageKey } from '../types';

export const PAGE_PATHS = {
  home: '/',
  'new-session': '/camera',
  calibration: '/readiness',
  'live-analysis': '/analysis',
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

export function routeForPage(page: PageKey, params?: { shotId?: string }): string {
  const path = PAGE_PATHS[page];
  if (page === 'replay-analysis' && params?.shotId) {
    return `${path}?shot=${encodeURIComponent(params.shotId)}`;
  }
  return path;
}

export function resolvePageFromPathname(pathname: string): PageKey | undefined {
  return PAGE_BY_PATH.get(normalizePathname(pathname));
}

export function pageForPathname(pathname: string): PageKey {
  return resolvePageFromPathname(pathname) ?? 'home';
}
