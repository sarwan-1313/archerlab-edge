import { useCallback, useEffect, useState } from 'react';
import { describeCloudError } from './cloudSync';
import { addComment, deleteComment, listComments, type ReportComment } from './coachReview';
import type { CloudSession, SupabaseRest } from './supabaseRest';

/** Comments on a report in the cloud. Pass a null report id to switch them off. */
export function useReportComments(client: SupabaseRest | null, freshSession: () => Promise<CloudSession | null>, reportId: string | null) {
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    setComments([]);
    setStatus(null);
    if (!client || !reportId) return;
    let cancelled = false;
    void freshSession().then((session) => (session ? listComments(client, session, reportId) : []))
      .then((rows) => { if (!cancelled) setComments(rows); })
      .catch((error: unknown) => { if (!cancelled) setStatus(describeCloudError(error)); });
    return () => { cancelled = true; };
  }, [client, freshSession, reportId, revision]);

  const add = useCallback(async (body: string, at: { timeS: number; shotIndex: number | null } | null): Promise<boolean> => {
    if (!client || !reportId) return false;
    setBusy(true);
    setStatus(null);
    try {
      const session = await freshSession();
      if (!session) { setStatus('Your sign-in has expired. Sign in again on your Profile page.'); return false; }
      const saved = await addComment(client, session, { reportId, body, timeS: at?.timeS ?? null, shotIndex: at?.shotIndex ?? null });
      setComments((current) => [...current, saved]);
      return true;
    } catch (error) {
      setStatus(describeCloudError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [client, freshSession, reportId]);

  const remove = useCallback(async (commentId: string) => {
    if (!client) return;
    setBusy(true);
    setStatus(null);
    try {
      const session = await freshSession();
      if (!session) { setStatus('Your sign-in has expired. Sign in again on your Profile page.'); return; }
      await deleteComment(client, session, commentId);
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  }, [client, freshSession]);

  return { comments, status, busy, add, remove, refresh };
}
