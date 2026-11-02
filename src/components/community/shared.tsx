import { useCallback, useEffect, useState } from 'react';
import { describeCloudError } from '../../cloud/account/cloudSync';
import { CloudError, type CloudSession, type SupabaseRest } from '../../cloud/account/supabaseRest';

export type CommunityApi = { client: SupabaseRest; freshSession: () => Promise<CloudSession | null> };

/** The club being viewed, and who is looking. */
export interface ClubContext { id: string; name: string; isCoach: boolean; userId: string }

export interface PanelProps { api: CommunityApi; club: ClubContext }

const EXPIRED = 'Your sign-in has expired. Sign in again on your Profile page.';

/** Runs a cloud call with a fresh session, and turns a failure into a sentence for the screen. */
export function useClubCall(api: CommunityApi) {
  const [status, setStatus] = useState<string | null>(null);
  const call = useCallback(async <T,>(work: (session: CloudSession, client: SupabaseRest) => Promise<T>, onError?: (message: string) => void): Promise<T | undefined> => {
    try {
      const session = await api.freshSession();
      if (!session) throw new CloudError(EXPIRED, 401);
      const result = await work(session, api.client);
      setStatus(null);
      return result;
    } catch (error) {
      const message = describeCloudError(error);
      setStatus(message);
      onError?.(message);
      return undefined;
    }
  }, [api]);
  return { call, status, setStatus };
}

/** Calls `load` now and every `everyMs` while the page is visible (and again when it becomes visible), for the live chat. */
export function useRefresh(load: () => void, everyMs: number | null) {
  useEffect(() => {
    load();
    if (everyMs === null) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    const timer = window.setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [load, everyMs]);
}

export function formatWhen(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const date = new Date(then);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (minutes < 24 * 60 && new Date(now).toDateString() === date.toDateString()) return time;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
