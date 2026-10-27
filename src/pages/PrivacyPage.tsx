import { useState, type ReactNode } from 'react';
import { deleteAllCloudData, deleteCloudAccount, describeCloudError } from '../cloud/account/cloudSync';
import { useCloudAccount } from '../cloud/account/useCloudAccount';
import { accountsEnabled, dropboxEnabled, googleDriveEnabled } from '../cloud/config';
import { ActionButton } from '../components/ActionButton';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { LocalDataError, deleteAllVideoAnalyses, deleteEverythingOnDevice, exportAllVideoReports } from '../privacy/localData';
import '../styles/video.css';

const ISSUES_URL = 'https://github.com/sarwan-1313/archerlab-edge/issues';

type Status = { tone: 'info' | 'error'; text: string } | null;

function Section({ id, icon, title, children }: { id: string; icon: AppIconName; title: string; children: ReactNode }) {
  return (
    <section className="va-panel privacy-section" aria-labelledby={id}>
      <h2 id={id}><AppIcon name={icon} size={20} /> {title}</h2>
      {children}
    </section>
  );
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PrivacyPage({ onProfile }: { onProfile?: () => void } = {}) {
  const account = useCloudAccount();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const storageImport = dropboxEnabled || googleDriveEnabled;

  const run = async (label: string, work: () => Promise<string | void>) => {
    setBusy(label);
    setStatus(null);
    try {
      const done = await work();
      if (done) setStatus({ tone: 'info', text: done });
    } catch (error) {
      console.error(`${label} failed`, error);
      setStatus({ tone: 'error', text: error instanceof LocalDataError ? error.message : describeCloudError(error) });
    } finally {
      setBusy(null);
    }
  };

  const exportReports = () => run('export', async () => {
    const result = await exportAllVideoReports();
    if (!result) return 'There are no video analyses on this device to export.';
    download(result.blob, `archerlab-video-reports-${new Date().toISOString().slice(0, 10)}.json`);
    return `Exported ${result.count} video report${result.count === 1 ? '' : 's'}.`;
  });

  const deleteVideo = () => {
    if (!window.confirm('Delete all video analyses on this device?\n\nEvery video report, and any videos you chose to keep, will be removed from this browser. This cannot be undone. Copies backed up to an account are not affected.')) return;
    void run('delete-video', async () => { await deleteAllVideoAnalyses(); return 'All video analyses were deleted from this device.'; });
  };

  const deleteEverything = () => {
    if (!window.confirm('Delete everything ArcherLab stores on this device?\n\nYour profile and photo, live session recordings, video analyses, settings, saved AI keys and your sign-in will be removed from this browser. This cannot be undone. Data in an account is not affected.')) return;
    void run('delete-all', async () => {
      await deleteEverythingOnDevice();
      // Start afresh so nothing still in memory is written back.
      window.location.assign('/');
    });
  };

  const deleteCloud = () => {
    if (!window.confirm('Delete all your cloud data?\n\nEvery backed-up video report, every backed-up video and your backed-up profile will be deleted from your account. Your account stays, and data on this device is not affected. This cannot be undone.')) return;
    void run('delete-cloud', async () => {
      if (!account.client) return;
      const session = await account.freshSession();
      if (!session) return 'Your sign-in has expired. Sign in again on your Profile page.';
      const { files, reports } = await deleteAllCloudData(account.client, session);
      return `Deleted ${reports} report${reports === 1 ? '' : 's'} and ${files} video file${files === 1 ? '' : 's'} from your account.`;
    });
  };

  const deleteAccount = () => {
    if (!window.confirm('Delete your account?\n\nAll your cloud data (reports, videos and profile) and the account itself will be deleted, and you will be signed out. Data on this device is not affected. This cannot be undone.')) return;
    void run('delete-account', async () => {
      if (!account.client) return;
      const session = await account.freshSession();
      if (!session) return 'Your sign-in has expired. Sign in again on your Profile page.';
      await deleteCloudAccount(account.client, session);
      await account.signOut();
      return 'Your account and its cloud data were deleted, and you are signed out.';
    });
  };

  return (
    <div className="page-container privacy-page">
      <PageHeader title="Privacy" subtitle="What ArcherLab Edge does with your data, in plain language, and how to export or remove it." />

      <Section id="privacy-device" icon="shield" title="What runs on this device">
        <ul>
          <li><strong>Live analysis.</strong> Camera frames go to a pose model that runs in this browser. They are measured and then discarded; they are never uploaded.</li>
          <li><strong>Video analysis.</strong> The video you choose is read and tracked frame by frame in this browser, including its sound. The file is not uploaded.</li>
          <li>The pose models are served by this website itself, not loaded from another company’s servers. ArcherLab has no server that receives your data.</li>
        </ul>
      </Section>

      <Section id="privacy-stored" icon="history" title="What is stored on this device">
        <p>Kept in this browser’s storage until you delete it here or clear this site’s data in your browser:</p>
        <ul>
          <li><strong>Athlete profile</strong>: name, archer ID, bow and handedness, experience level, form status, and your photo if you add one.</li>
          <li><strong>Live session recordings</strong>: the video and movement data of sessions you record.</li>
          <li><strong>Video reports</strong>: measurements, scores and the tracked body positions of each analysed clip. The video itself only if you tick “Keep the video on this device”.</li>
          <li><strong>Settings</strong>: analysis options, onboarding progress and the shots of the current session.</li>
          <li><strong>Saved AI keys</strong>: only if you enter one. They are kept for this tab, or on this device if you tick “remember”.</li>
          {accountsEnabled ? <li><strong>Your sign-in</strong>, if you sign in to an account.</li> : null}
        </ul>
      </Section>

      <Section id="privacy-optional" icon="cloud" title="What the optional features send, and to whom">
        <p>These are off until you use them. Nothing is sent in the background.</p>
        <ul>
          <li><strong>AI review</strong> (“Second opinion from AI coaches” in a report): after you tick the consent box, the measurements are sent to the AI providers you pick (Anthropic, OpenAI and/or Google), using your own API key. While the video is open or kept on this device, six annotated still frames go with them; without the video, only the measurements are sent. If you also allow it, Gemini receives the whole clip instead of stills. Each provider’s terms and privacy policy apply.</li>
          <li>
            <strong>Account backup</strong>{accountsEnabled ? '' : ' (switched off in this copy of the app)'}: when you sign in and press a backup button, your profile (without the photo) and your video reports (without the frame-by-frame body positions) are stored in a Supabase database run by whoever deployed this copy of ArcherLab. Videos are uploaded only when you press “Back up report + video”. Each account can reach only its own data.
          </li>
          {storageImport ? <li><strong>Import from Dropbox or Google Drive</strong>: the file you pick is downloaded into this browser. Dropbox or Google see that you used their picker; nothing is uploaded to them.</li> : null}
          <li><strong>Import from a link</strong>: this browser downloads the file from the link you paste, so the site that hosts it sees the request, as it would for any download. Nothing is uploaded.</li>
        </ul>
      </Section>

      <Section id="privacy-young" icon="user" title="Young athletes">
        <p>If you are under 18, ask a parent or guardian before using AI review or account backup; the AI review asks you to confirm that they agreed. Coaches and clubs should have agreement from a parent or guardian before filming or analysing young athletes, even though the analysis itself stays on the device.</p>
      </Section>

      <Section id="privacy-controls" icon="download" title="Your data on this device">
        <div className="privacy-actions">
          <ActionButton variant="secondary" type="button" disabled={busy !== null} onClick={() => void exportReports()}><AppIcon name="download" size={16} /> {busy === 'export' ? 'Exporting…' : 'Export all video reports (JSON)'}</ActionButton>
          <ActionButton variant="danger" type="button" disabled={busy !== null} onClick={deleteVideo}><AppIcon name="trash" size={16} /> Delete all video analyses on this device</ActionButton>
          <ActionButton variant="danger" type="button" disabled={busy !== null} onClick={deleteEverything}><AppIcon name="trash" size={16} /> Delete everything on this device</ActionButton>
        </div>
        <p className="va-faint">The export holds every video report with its tracked body positions, so treat it like the videos themselves. To restore it, use “Open report file” on the Video Analysis page. Deleting here never touches data in an account.</p>
      </Section>

      {account.configured ? (
        <Section id="privacy-account" icon="cloud" title="Your account">
          {account.session ? (
            <>
              <p>Signed in as {account.session.user.email ?? 'your account'}.</p>
              <div className="privacy-actions">
                <ActionButton variant="danger" type="button" disabled={busy !== null} onClick={deleteCloud}><AppIcon name="trash" size={16} /> {busy === 'delete-cloud' ? 'Deleting…' : 'Delete my cloud data'}</ActionButton>
                <ActionButton variant="danger" type="button" disabled={busy !== null} onClick={deleteAccount}><AppIcon name="trash" size={16} /> {busy === 'delete-account' ? 'Deleting…' : 'Delete my account'}</ActionButton>
              </div>
            </>
          ) : (
            <p>Sign in on your <button type="button" className="privacy-link" onClick={onProfile}>Profile page</button> to delete data backed up to your account, or the account itself.</p>
          )}
        </Section>
      ) : null}

      {status ? <p className={`va-callout${status.tone === 'info' ? ' va-callout--info' : ''}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</p> : null}

      <Section id="privacy-questions" icon="link" title="Questions">
        <p>Ask about privacy, or report a problem, in the project’s <a href={ISSUES_URL} target="_blank" rel="noreferrer">GitHub issues</a>. Issues are public, so do not post personal details there.</p>
      </Section>
    </div>
  );
}
