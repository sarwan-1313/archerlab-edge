import { useState } from 'react';
import { useDriveSync } from '../../cloud/drive/useDriveSync';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

function savedLabel(at: number | null): string {
  if (!at) return 'Not saved yet.';
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return 'Last saved just now.';
  if (minutes < 60) return `Last saved ${minutes} minute${minutes === 1 ? '' : 's'} ago.`;
  return `Last saved ${new Date(at).toLocaleString()}.`;
}

/** Save the athlete's data to their own Google Drive and bring it back on another device. */
export function DriveBackupPanel({ loginHint }: { loginHint?: string }) {
  const drive = useDriveSync();
  const [includeVideos, setIncludeVideos] = useState(false);
  if (!drive.enabled) return null;
  const busy = drive.status === 'saving' || drive.status === 'restoring';
  const progress = drive.progress && drive.progress.total > 1 ? ` (${drive.progress.done} of ${drive.progress.total})` : '';

  return (
    <section className="drive-backup" aria-labelledby="drive-title">
      <h3 id="drive-title"><AppIcon name="cloud" size={18} /> Save to your Google Drive</h3>
      {!drive.chosen ? (
        <>
          <p className="va-muted">Your profile, practice log, settings and video reports are saved in an <strong>ArcherLab Edge</strong> folder in your own Google Drive, not on ArcherLab’s servers. ArcherLab can only see the files it puts in that folder. Changes save automatically, and connecting on a new phone brings everything back.</p>
          <div className="va-actions">
            <ActionButton variant="primary" type="button" onClick={() => void drive.connect(loginHint)}><AppIcon name="cloud" size={16} /> Connect Google Drive</ActionButton>
          </div>
        </>
      ) : (
        <>
          <p className="va-muted">
            {drive.status === 'saving' ? `Saving to Google Drive…${progress}` : drive.status === 'restoring' ? `Restoring from Google Drive…${progress}` : savedLabel(drive.lastSavedAt)}
            {drive.status === 'needs-connect' ? ` Google asks you to reconnect about once an hour${drive.pending ? '; your latest changes will save when you do' : ''}.` : drive.status === 'idle' ? ' Changes save automatically.' : ''}
          </p>
          <div className="va-actions">
            {drive.status === 'needs-connect' ? (
              <ActionButton variant="primary" type="button" onClick={() => void drive.connect(loginHint)}><AppIcon name="refresh" size={16} /> Reconnect Google Drive</ActionButton>
            ) : (
              <ActionButton variant="secondary" type="button" disabled={busy} onClick={() => void drive.saveNow()}><AppIcon name="upload" size={16} /> Save now</ActionButton>
            )}
            <ActionButton variant="secondary" type="button" disabled={busy || drive.status === 'needs-connect'} onClick={() => void drive.restoreNow(includeVideos)}><AppIcon name="download" size={16} /> Restore from Drive</ActionButton>
            <ActionButton variant="ghost" type="button" disabled={busy} onClick={drive.disconnect}>Stop saving to Drive</ActionButton>
          </div>
          <label className="drive-backup__option">
            <input type="checkbox" checked={includeVideos} onChange={(event) => setIncludeVideos(event.target.checked)} />
            Also download saved videos when restoring (uses more data)
          </label>
        </>
      )}
      {drive.message ? <p className="va-import-status" role="status">{drive.message}</p> : null}
    </section>
  );
}
