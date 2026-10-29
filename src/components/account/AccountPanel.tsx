import { useState, type FormEvent } from 'react';
import { describeCloudError, pullPracticeLog, pullProfile, pushPracticeLog, pushProfile } from '../../cloud/account/cloudSync';
import { mergePracticeLog, readPracticeLog } from '../../practice-log/storage';
import { useCloudAccount } from '../../cloud/account/useCloudAccount';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

type AccountPanelProps = {
  profile: Record<string, unknown> | null;
  onRestoreProfile: (data: Record<string, unknown>) => Promise<void>;
};

/** Optional account: back up the profile and video reports, and pick them up on another device. */
export function AccountPanel({ profile, onRestoreProfile }: AccountPanelProps) {
  const account = useCloudAccount();
  const [email, setEmail] = useState('');
  const [syncing, setSyncing] = useState(false);

  if (!account.configured) {
    return (
      <section className="va-panel account-panel" aria-labelledby="account-title">
        <h2 id="account-title"><AppIcon name="cloud" size={20} /> Account &amp; backup</h2>
        <p className="va-muted">This copy of ArcherLab Edge runs without accounts: everything stays on this device. Accounts and cloud backup can be switched on by whoever deploys the app (see docs/cloud-setup.md).</p>
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
      const log = await pullPracticeLog(account.client, session);
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
          <p className="va-muted">Signed in as <strong>{account.session.user.email ?? 'your account'}</strong>. Back up your profile and practice log here; video reports can be backed up from each report.</p>
          <div className="va-actions">
            <ActionButton variant="secondary" type="button" disabled={syncing} onClick={() => void backup()}><AppIcon name="upload" size={16} /> Back up profile &amp; log</ActionButton>
            <ActionButton variant="secondary" type="button" disabled={syncing} onClick={() => void restore()}><AppIcon name="download" size={16} /> Restore profile &amp; log</ActionButton>
            <ActionButton variant="ghost" type="button" onClick={() => void account.signOut()}>Sign out</ActionButton>
          </div>
        </>
      ) : (
        <>
          <p className="va-muted">Sign in to back up your profile, practice log and video reports and open them on another device. Without an account, everything keeps working on this device.</p>
          <form onSubmit={submit}>
            <input type="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email" />
            <ActionButton variant="primary" type="submit" disabled={account.busy}>Email me a sign-in link</ActionButton>
            <ActionButton variant="secondary" type="button" onClick={account.signInWithGoogle}>Continue with Google</ActionButton>
          </form>
        </>
      )}
      {account.message ? <p className="va-import-status" role="status">{account.message}</p> : null}
    </section>
  );
}
