import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { backupReport, describeCloudError } from '../../cloud/account/cloudSync';
import { cloudReportState, listShares, revokeShare, shareReport, sharedReportLink, type ReportShare } from '../../cloud/account/coachReview';
import type { CloudSession, SupabaseRest } from '../../cloud/account/supabaseRest';
import { formatDate } from '../../video-analysis/format';
import type { VideoAnalysisReport } from '../../video-analysis/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

type ShareWithCoachPanelProps = {
  report: VideoAnalysisReport;
  /** The original video, when it is open or kept on this device. */
  videoBlob: Blob | null;
  client: SupabaseRest;
  freshSession: () => Promise<CloudSession | null>;
  /** Called after the panel backed the report up, so the page can show it as in the account. */
  onBackedUp?: () => void;
};

/** Signed-in athletes share a report read-only with a coach, who opens it from a link the athlete sends. */
export function ShareWithCoachPanel({ report, videoBlob, client, freshSession, onBackedUp }: ShareWithCoachPanelProps) {
  const [email, setEmail] = useState('');
  const [includeVideo, setIncludeVideo] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [cloudVideo, setCloudVideo] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = sharedReportLink(window.location.origin, report.id);
  const videoAvailable = Boolean(videoBlob) || cloudVideo;

  const refresh = useCallback(async () => {
    const session = await freshSession();
    if (!session) return;
    const state = await cloudReportState(client, session, report.id);
    setCloudVideo(state.hasVideo);
    setShares(state.backedUp ? await listShares(client, session, report.id) : []);
  }, [client, freshSession, report.id]);

  useEffect(() => {
    refresh().catch((error: unknown) => setStatus(describeCloudError(error)));
  }, [refresh]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed || !email.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const session = await freshSession();
      if (!session) { setStatus('Your sign-in has expired. Sign in again on your Profile page.'); return; }
      // The coach reads the copy in the account, so back it up first (with the video when it is shared).
      const state = await cloudReportState(client, session, report.id);
      const needsVideo = includeVideo && !state.hasVideo;
      if (needsVideo && !videoBlob) { setStatus('The video is not on this device or in your account, so it cannot be shared. Untick “Include the video” to share the report only.'); return; }
      if (!state.backedUp || needsVideo) {
        setStatus(needsVideo ? 'Backing up the report and video…' : 'Backing up the report…');
        const result = await backupReport(client, session, report, needsVideo ? videoBlob : null);
        onBackedUp?.();
        if (needsVideo && !result.videoUploaded) {
          setStatus(`${result.videoSkippedReason ?? 'The video could not be backed up.'} Untick “Include the video” to share the report only.`);
          return;
        }
      }
      const share = await shareReport(client, session, { reportId: report.id, coachEmail: email, includeVideo });
      setEmail('');
      setConfirmed(false);
      setStatus(`Shared with ${share.coach_email}${share.include_video ? ', with the video' : ''}. Send them the link below; ArcherLab does not email them.`);
      await refresh();
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (share: ReportShare) => {
    if (!window.confirm(`Stop sharing with ${share.coach_email}?\n\nThey will no longer be able to open this report${share.include_video ? ' or its video' : ''}, or comment on it. Comments already written stay with the report.`)) return;
    setBusy(true);
    setStatus(null);
    try {
      const session = await freshSession();
      if (!session) { setStatus('Your sign-in has expired. Sign in again on your Profile page.'); return; }
      await revokeShare(client, session, share.id);
      setStatus(`${share.coach_email} can no longer open this report.`);
      await refresh();
    } catch (error) {
      setStatus(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus('Copying is blocked here. Select the link and copy it yourself.');
    }
  };

  return (
    <section className="va-panel va-share" aria-labelledby="va-share-title">
      <h2 id="va-share-title"><AppIcon name="user" size={20} /> Share with a coach <small>optional · read-only</small></h2>
      <p className="va-muted">Your coach signs in with the email you enter here and can then read this report{videoAvailable ? ', watch the video if you include it,' : ''} and comment on it. They cannot change or delete it, and you can stop sharing at any time. The report is backed up to your account first if it is not there yet.</p>
      <form className="va-share__form" onSubmit={(event) => void submit(event)}>
        <input type="email" required placeholder="coach@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Coach’s email" disabled={busy} />
        <label className="va-toggle"><input type="checkbox" checked={includeVideo} disabled={!videoAvailable || busy} onChange={(event) => setIncludeVideo(event.target.checked)} /><span>Include the video<small>{videoAvailable ? `Off: your coach sees the results and timeline, not the footage.${!cloudVideo && videoBlob ? ' On: the video is uploaded to your account.' : ''}` : 'Available while the original video is open, kept on this device or backed up.'}</small></span></label>
        <label className="va-toggle va-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>Only share with a coach you trust.<small>If you’re under 18, ask a parent or guardian first.</small></span></label>
        <div className="va-actions">
          <ActionButton variant="primary" type="submit" disabled={busy || !confirmed || !email.trim()}><AppIcon name="link" size={16} /> {busy ? 'Sharing…' : 'Share report'}</ActionButton>
        </div>
      </form>
      {status ? <p className="va-import-status" role="status">{status}</p> : null}
      {shares.length ? (
        <>
          <ul className="va-share__list" aria-label="Coaches with access">
            {shares.map((share) => (
              <li key={share.id}>
                <span><strong>{share.coach_email}</strong><small>since {formatDate(Date.parse(share.created_at))} · {share.include_video ? 'report and video' : 'report only'}</small></span>
                <ActionButton variant="ghost" type="button" disabled={busy} onClick={() => void revoke(share)}>Revoke</ActionButton>
              </li>
            ))}
          </ul>
          <div className="va-share__link">
            <input type="text" readOnly value={link} aria-label="Link for your coach" onFocus={(event) => event.target.select()} />
            <ActionButton variant="secondary" type="button" onClick={() => void copy()}><AppIcon name="link" size={16} /> {copied ? 'Copied' : 'Copy link'}</ActionButton>
          </div>
          <p className="va-faint">Send this link to your coach yourself. It only works for the emails listed above, after they sign in.</p>
        </>
      ) : null}
    </section>
  );
}
