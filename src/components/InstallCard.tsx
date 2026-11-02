import { useState } from 'react';
import { INSTALL_DISMISSED_KEY, useInstallPrompt } from '../pwa/install';
import { ActionButton } from './ActionButton';
import { AppIcon } from './AppIcon';

const SITE = 'https://archerlab-edge.vercel.app';
/** Opened from the QR code (`/?install=1`): read once at load, before the app tidies the address. */
const OPENED_TO_INSTALL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('install');

function readDismissed(): boolean {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'; } catch { return false; }
}

/**
 * "Install ArcherLab": the browser's own install prompt where there is one,
 * Share → Add to Home Screen steps on iPhone and iPad, and a QR code so a
 * computer user can open the app on their phone. Hidden once installed.
 */
export function InstallCard({ highlight = OPENED_TO_INSTALL }: { highlight?: boolean }) {
  const install = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => !highlight && readDismissed());
  const [status, setStatus] = useState<string | null>(null);
  if (install.installed || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };
  const run = async () => {
    const outcome = await install.prompt();
    if (outcome === 'accepted') setStatus('Installed. Open ArcherLab from your home screen or app list.');
  };
  const shareLink = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'ArcherLab Edge', text: 'Archery form analysis and scoring, free on your phone', url: SITE }); return; }
      await navigator.clipboard.writeText(SITE);
      setStatus('Link copied.');
    } catch { /* cancelled */ }
  };

  return (
    <section className={`install-card${highlight ? ' install-card--highlight' : ''}`} aria-labelledby="install-title">
      <div className="install-card__body">
        <h2 id="install-title"><AppIcon name="smartphone" size={20} /> Install ArcherLab, free</h2>
        <p>Put ArcherLab on your home screen like any app: full screen, works offline at the range, and updates itself. No app store or account needed.</p>
        {install.canPrompt ? (
          <div className="va-actions">
            <ActionButton variant="primary" type="button" onClick={() => void run()}><AppIcon name="download" size={16} /> Install app</ActionButton>
          </div>
        ) : install.platform === 'ios' ? (
          <ol className="install-card__steps">
            <li>Open this page in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button (the square with an arrow).</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        ) : install.platform === 'android' ? (
          <ol className="install-card__steps">
            <li>Open this page in <strong>Chrome</strong>.</li>
            <li>Tap the <strong>⋮</strong> menu.</li>
            <li>Choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
          </ol>
        ) : (
          <p className="install-card__hint">In Chrome or Edge, use the install icon at the right of the address bar. On a phone, scan the code.</p>
        )}
        <div className="va-actions">
          <ActionButton variant="ghost" type="button" onClick={() => void shareLink()}><AppIcon name="share" size={16} /> Send the link to a friend</ActionButton>
          <ActionButton variant="ghost" type="button" onClick={dismiss}>Not now</ActionButton>
        </div>
        {status ? <p className="install-card__status" role="status">{status}</p> : null}
      </div>
      {install.platform === 'desktop' || install.platform === 'other' || highlight ? (
        <figure className="install-card__qr">
          <img src="/install-qr.svg" alt="QR code that opens ArcherLab Edge on a phone" width={164} height={164} />
          <figcaption>Scan with your phone camera</figcaption>
        </figure>
      ) : null}
    </section>
  );
}
