import { useState, type FormEvent } from 'react';
import { describeCloudError, pullPracticeLog, pullProfile, pushPracticeLog, pushProfile } from '../../cloud/account/cloudSync';
import { mergePracticeLog, readPracticeLog } from '../../practice-log/storage';
import { useCloudAccount } from '../../cloud/account/useCloudAccount';
import { accountDataBackup, driveBackupEnabled } from '../../cloud/config';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { DriveBackupPanel } from './DriveBackupPanel';

type AccountPanelProps = {
  profile: Record<string, unknown> | null;
  onRestoreProfile: (data: Record<string, unknown>) => Promise<void>;
  /** Opens My club. */
  onClub?: () => void;
};

/**
 * Optional account and backup. The account (Google sign-in) keeps only the
 * sign-in and a small profile; the athlete's data is saved to their own Google
 * Drive when this copy of the app has Drive saving switched on.
 */
export function AccountPanel({ profile, onRestoreProfile, onClub }: AccountPanelProps) {
  const account = useCloudAccount();
  const [email, setEmail] = useState('');
  const [syncing, setSyncing] = useState(false);

  if (!account.configured) {
    return (
      <section className="va-panel account-panel" aria-labelledby="account-title">
        <h2 id="account-title"><AppIcon name="cloud" size={20} /> {driveBackupEnabled ? <>Backup <small>optional</small></> : <>Account &amp; backup</>}</h2>
        {driveBackupEnabled ? <DriveBackupPanel /> : (
          <p className="va-muted">This copy of ArcherLab Edge runs without accounts: everything stays on this device. Accounts and cloud backup can be switched on by whoever deploys the app (see docs/cloud-setup.md).</p>
        )}
      </section>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) void account.signInWithEmail(email.trim());
  };

  const backup = async () => {
    if (!account.client) return;
    setSyncing(true);
    try {
      const session = await account.freshSession();
      if (!session) { account.setMessage('Sign in again to back up.'); return; }
      if (profile) await pushProfile(account.client, session, profile);
      if (!accountDataBackup) { account.setMessage('Your name, hand, bow and level are up to date in your account.'); return; }
      // Merge the backup in first, so backing up from a new or cleared device never wipes the log in the account.
      const backedUp = await pullPracticeLog(account.client, session);
      if (backedUp) await mergePracticeLog(backedUp);
      const log = await readPracticeLog();
      await pushPracticeLog(account.client, session, log);
      const entries = `${log.entries.length} practice log entr${log.entries.length === 1 ? 'y' : 'ies'}`;
      account.setMessage(profile ? `Profile and ${entries} backed up to your account.` : `${entries.replace(/^./, (first) => first.toUpperCase())} backed up to your account.`);
    } catch (error) {
      account.setMessage(describeCloudError(error));
    } finally {
      setSyncing(false);
    }
  };

  const restore = async () => {
    if (!account.client) return;
    setSyncing(true);
    try {
      const session = await account.freshSession();
      if (!session) { account.setMessage('Sign in again to restore.'); return; }
      const data = await pullProfile(account.client, session);
      const log = accountDataBackup ? await pullPracticeLog(account.client, session) : null;
      if (!data && !log) { account.setMessage('Nothing is saved in your account yet.'); return; }
      if (data) await onRestoreProfile(data);
      // Merged, so entries logged on this device since the backup are kept.
      const merged = log ? await mergePracticeLog(log) : 0;
      account.setMessage([data ? 'Profile restored' : null, log ? `${merged} practice log entr${merged === 1 ? 'y' : 'ies'} merged` : null].filter(Boolean).join('; ') + ' from your account.');
    } catch (error) {
      account.setMessage(describeCloudError(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="va-panel account-panel" aria-labelledby="account-title">
      <h2 id="account-title"><AppIcon name="cloud" size={20} /> Account &amp; backup <small>optional</small></h2>
      {account.session ? (
        <>
          <p className="va-muted">Signed in as <strong>{account.session.user.email ?? 'your account'}</strong>. {accountDataBackup
            ? 'Back up your profile and practice log here; video reports can be backed up from each report.'
            : 'Your ArcherLab account keeps only your sign-in and a small profile (name, hand, bow and level), so coaches and clubs know who you are.'}</p>
          <div className="va-actions">
            {accountDataBackup ? (
              <>
                <ActionButton variant="secondary" type="button" disabled={syncing} onClick={() => void backup()}><AppIcon name="upload" size={16} /> Back up profile &amp; log</ActionButton>
                <ActionButton variant="secondary" type="button" disabled={syncing} onClick={() => void restore()}><AppIcon name="download" size={16} /> Restore profile &amp; log</ActionButton>
              </>
            ) : (
              <ActionButton variant="secondary" type="button" disabled={syncing} onClick={() => void restore()}><AppIcon name="download" size={16} /> Use profile from my account</ActionButton>
            )}
            {onClub ? <ActionButton variant="secondary" type="button" onClick={onClub}><AppIcon name="user" size={16} /> My club</ActionButton> : null}
            <ActionButton variant="ghost" type="button" onClick={() => void account.signOut()}>Sign out</ActionButton>
          </div>
        </>
      ) : (
        <>
          <p className="va-muted">{driveBackupEnabled
            ? 'Sign in with Google to keep a small profile for coaches and clubs. Your data itself is saved to your own Google Drive below, not to ArcherLab. Without signing in, everything keeps working on this device.'
            : 'Sign in to back up your profile, practice log and video reports and open them on another device. Without an account, everything keeps working on this device.'}</p>
          <div className="va-actions">
            <ActionButton variant="primary" type="button" onClick={account.signInWithGoogle}>Continue with Google</ActionButton>
          </div>
          <form onSubmit={submit}>
            <input type="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email" />
            <ActionButton variant="secondary" type="submit" disabled={account.busy}>Email me a sign-in link</ActionButton>
          </form>
        </>
      )}
      {driveBackupEnabled ? <DriveBackupPanel loginHint={account.session?.user.email ?? undefined} /> : null}
      {account.message ? <p className="va-import-status" role="status">{account.message}</p> : null}
    </section>
  );
}
