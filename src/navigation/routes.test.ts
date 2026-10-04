import { describe, expect, it } from 'vitest';
import type { PageKey } from '../types';
import { PAGE_PATHS, pageForPathname, resolvePageFromPathname, routeForPage } from './routes';

const EXPECTED_ROUTES = {
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
} as const satisfies Record<PageKey, string>;

describe('page routes', () => {
  it('provides one canonical path for every page', () => {
    expect(PAGE_PATHS).toEqual(EXPECTED_ROUTES);
    expect(new Set(Object.values(PAGE_PATHS)).size).toBe(Object.keys(PAGE_PATHS).length);
  });

  it('maps each page to its canonical route', () => {
    for (const [page, path] of Object.entries(EXPECTED_ROUTES) as Array<[PageKey, string]>) {
      expect(routeForPage(page)).toBe(path);
    }
  });

  it('maps each canonical pathname back to its page', () => {
    for (const [page, path] of Object.entries(EXPECTED_ROUTES) as Array<[PageKey, string]>) {
      expect(pageForPathname(path)).toBe(page);
    }
  });

  it('accepts trailing slashes without changing the resolved page', () => {
    expect(pageForPathname('/analysis/')).toBe('live-analysis');
    expect(pageForPathname('/guide/camera-setup/')).toBe('guide-camera-setup');
    expect(pageForPathname('/sessions///')).toBe('saved-recordings');
    expect(pageForPathname('/')).toBe('home');
  });

  it('falls back safely to home for unknown paths', () => {
    expect(pageForPathname('/not-a-route')).toBe('home');
    expect(pageForPathname('/analysis/readiness')).toBe('home');
    expect(pageForPathname('')).toBe('home');
  });

  it('distinguishes unknown paths when callers need to canonicalize the URL', () => {
    expect(resolvePageFromPathname('/guide/')).toBe('user-guide');
    expect(resolvePageFromPathname('/not-a-route')).toBeUndefined();
  });
});
