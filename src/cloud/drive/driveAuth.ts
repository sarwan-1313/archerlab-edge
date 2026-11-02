import { CLOUD_CONFIG } from '../config';
import { loadScript } from '../pickers';

/**
 * Google Drive access for saving the athlete's own data. The token has the
 * drive.file scope: ArcherLab can only see the files it created in the
 * athlete's Drive, never anything else there. Tokens last about an hour and
 * are kept in memory only; the athlete reconnects with one tap after that.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Set while the athlete has chosen to save to Drive on this device (no token is stored). */
export const DRIVE_CONNECTED_KEY = 'archerlab-edge:drive-connected';

interface TokenResponse { access_token?: string; expires_in?: number | string; error?: string }
interface TokenClient { requestAccessToken(options?: { prompt?: string; login_hint?: string }): void }
interface GoogleOAuth {
  accounts: { oauth2: {
    initTokenClient(config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback?: (error: { type?: string }) => void }): TokenClient;
    revoke(token: string, done?: () => void): void;
  } };
}

let token: { value: string; expiresAt: number } | null = null;

/** The current token, or null when there is none or it is about to expire. */
export function driveToken(now = Date.now()): string | null {
  return token && token.expiresAt - 60_000 > now ? token.value : null;
}

export function driveChosen(): boolean {
  try { return localStorage.getItem(DRIVE_CONNECTED_KEY) === '1'; } catch { return false; }
}

function setChosen(on: boolean) {
  try {
    if (on) localStorage.setItem(DRIVE_CONNECTED_KEY, '1');
    else localStorage.removeItem(DRIVE_CONNECTED_KEY);
  } catch { /* lasts for this page only */ }
}

/**
 * Asks Google for a Drive token. Call it from a button press: browsers block
 * the Google window otherwise. The first time, Google asks the athlete to agree.
 */
export async function connectDrive(loginHint?: string): Promise<string> {
  const clientId = CLOUD_CONFIG.googleClientId;
  if (!clientId) throw new Error('Saving to Google Drive is not configured in this copy of ArcherLab.');
  await loadScript('https://accounts.google.com/gsi/client');
  const google = (window as unknown as { google?: GoogleOAuth }).google;
  if (!google?.accounts?.oauth2) throw new Error('Google sign-in could not start. Check your connection or ad blocker.');
  const value = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (!response.access_token) { reject(new Error(response.error === 'access_denied' ? 'Google Drive access was not allowed.' : 'Google Drive connection was cancelled.')); return; }
        const seconds = Number(response.expires_in) || 3600;
        token = { value: response.access_token, expiresAt: Date.now() + seconds * 1000 };
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error?.type === 'popup_failed_to_open' ? 'The Google window was blocked. Allow pop-ups for this site and try again.' : 'Google Drive connection was cancelled.')),
    });
    client.requestAccessToken({ prompt: driveChosen() ? '' : 'consent', ...(loginHint ? { login_hint: loginHint } : {}) });
  });
  setChosen(true);
  return value;
}

/** Stops saving to Drive on this device and gives the token back to Google. Files already in Drive stay there. */
export function disconnectDrive(): void {
  const current = token?.value;
  token = null;
  setChosen(false);
  const google = (window as unknown as { google?: GoogleOAuth }).google;
  if (current && google?.accounts?.oauth2) google.accounts.oauth2.revoke(current);
}

/** For tests. */
export function setDriveTokenForTests(value: string | null, expiresAt = Date.now() + 3600_000): void {
  token = value ? { value, expiresAt } : null;
}
