import { useDriveSync } from '../../cloud/drive/useDriveSync';
import { formatBytes } from '../../video-analysis/format';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

/** Report actions for saving to the athlete's own Google Drive. The report itself saves automatically once Drive is connected. */
export function DriveReportButtons({ reportId, videoBlob }: { reportId: string; videoBlob: Blob | null }) {
  const drive = useDriveSync();
  if (!drive.enabled) return null;
  const busy = drive.status === 'saving' || drive.status === 'restoring';
  const status = drive.message ? <span className="va-import-status" role="status">{drive.message}</span> : null;
  if (!drive.chosen) {
    return (
      <ActionButton variant="secondary" type="button" title="Saves your reports, practice log and profile to your own Google Drive" onClick={() => void drive.connect()}>
        <AppIcon name="cloud" size={16} /> Save to Google Drive
      </ActionButton>
    );
  }
  if (drive.status === 'needs-connect') {
    return (
      <ActionButton variant="secondary" type="button" onClick={() => void drive.connect()}>
        <AppIcon name="refresh" size={16} /> Reconnect Google Drive
      </ActionButton>
    );
  }
  return videoBlob ? (
    <>
    <ActionButton variant="secondary" type="button" disabled={busy} title="The report is saved to your Drive automatically; this adds the video" onClick={() => void drive.saveVideoNow(reportId, videoBlob)}>
      <AppIcon name="upload" size={16} /> {busy ? 'Saving to Drive…' : `Save video to Drive (${formatBytes(videoBlob.size)})`}
    </ActionButton>
    {status}
    </>
  ) : status;
}
