import { useCallback, useEffect, useState } from 'react';
import { CLOUD_CONFIG, accountsEnabled } from '../config';
import { takePendingAuthRedirect } from './authRedirect';
import { describeCloudError, pushProfile } from './cloudSync';
import { loadProfile } from '../../profile/profileStorage';
import { leaveGuestMode } from '../../onboarding/guestMode';
import { CloudError, createSupabaseRest, type CloudSession, type SupabaseRest } from './supabaseRest';

let client: SupabaseRest | null = null;

export function cloudClient(): SupabaseRest | null {
  if (!accountsEnabled) return null;
  if (!client) client = createSupabaseRest(CLOUD_CONFIG.supabaseUrl as string, CLOUD_CONFIG.supabaseAnonKey as string);
  return client;
}

const listeners = new Set<(session: CloudSession | null) => void>();
let currentSession: CloudSession | null = null;
let initialised = false;
// Set once the stored session has been checked, so pages can tell "signed out" from "not known yet".
let resolved = false;

function publish(session: CloudSession | null) {
  currentSession = session;
  // Signing in means the athlete wants their work kept.
  if (session) leaveGuestMode();
  resolved = true;
  listeners.forEach((listener) => listener(session));
}

// The account message ("Signed in.", "Sign-in failed: …") is shared, so it shows on whichever page shows
// account messages, whichever copy of the hook happened to finish the sign-in.
const messageListeners = new Set<(message: string | null) => void>();
let currentMessage: string | null = null;

function shareMessage(message: string | null) {
  currentMessage = message;
  messageListeners.forEach((listener) => listener(message));
}

let profileSyncStarted = false;

/**
 * Keeps the small account profile (name, hand, bow, level) up to date after the
 * athlete saves their profile while signed in. Safe to call more than once.
 */
export function startAccountProfileSync(): void {
  const api = cloudClient();
  if (!api || profileSyncStarted) return;
  profileSyncStarted = true;
  window.addEventListener('archerlab:profile-updated', () => {
    if (!currentSession) return;
    void (async () => {
      try {
        const session = await api.validSession();
        const profile = await loadProfile('default');
        if (session && profile) await pushProfile(api, session, profile);
      } catch (error) {
        console.warn('The account profile could not be updated', error);
      }
    })();
  });
}

/** Optional sign-in. Returns `configured: false` when the deployment has no cloud project. */
export function useCloudAccount() {
  const [session, setSession] = useState<CloudSession | null>(currentSession);
  const [ready, setReady] = useState(resolved);
  const [busy, setBusy] = useState(false);
  const [message, setLocalMessage] = useState<string | null>(currentMessage);
  const api = cloudClient();

  useEffect(() => {
    const listener = (next: CloudSession | null) => { setSession(next); setReady(true); };
    listeners.add(listener);
    messageListeners.add(setLocalMessage);
    if (api && !initialised) {
      initialised = true;
      const hash = takePendingAuthRedirect();
      (async () => {
        if (hash) {
          try {
            const result = await api.consumeRedirect(hash);
            if (result?.error) shareMessage(`Sign-in failed: ${result.error}`);
            if (result?.session) { publish(result.session); shareMessage('Signed in.'); return; }
          } catch (error) {
            shareMessage(`Sign-in failed: ${describeCloudError(error)}`);
          }
        }
        try {
          publish(await api.validSession());
        } catch {
          // The session could not be refreshed right now (offline, timeout, outage). Stay signed in with the
          // stored session; the next cloud call refreshes it or reports the problem.
          publish(api.loadSession());
        }
      })();
    }
    return () => {
      listeners.delete(listener);
      messageListeners.delete(setLocalMessage);
    };
  }, [api]);

  /** Emails a sign-in link and code. True when the email was sent. */
  const signInWithEmail = useCallback(async (email: string) => {
    if (!api) return false;
    setBusy(true);
    shareMessage(null);
    try {
      await api.signInWithEmail(email, `${window.location.origin}/profile`);
      shareMessage(`Check ${email} for a sign-in link, or enter the 6-digit code from the email.`);
      return true;
    } catch (error) {
      shareMessage(describeCloudError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [api]);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    if (!api) return;
    setBusy(true);
    shareMessage(null);
    try {
      publish(await api.verifyEmailCode(email, code));
      shareMessage('Signed in.');
    } catch (error) {
      // The auth server answers a wrong, used or expired code with 400 or 403, which elsewhere means "no access".
      const refused = error instanceof CloudError && (error.status === 400 || error.status === 403);
      shareMessage(refused ? 'That code is wrong or has expired. Check the latest email, or send a new one.' : describeCloudError(error));
    } finally {
      setBusy(false);
    }
  }, [api]);

  const signInWithGoogle = useCallback(() => {
    if (api) window.location.assign(api.oauthUrl('google', `${window.location.origin}/profile`));
  }, [api]);

  const signOut = useCallback(async () => {
    if (!api) return;
    // Signed out on this device at once; ending the session on the server can take a while on a slow network.
    const ending = api.signOut();
    publish(null);
    shareMessage('Signed out. Your data on this device is unchanged.');
    await ending;
  }, [api]);

  /**
   * A fresh session for an API call, or null when signed out. Throws, without signing out, when the session
   * cannot be refreshed right now (offline, timeout, outage).
   */
  const freshSession = useCallback(async () => {
    if (!api) return null;
    const valid = await api.validSession();
    if (!valid) publish(null);
    return valid;
  }, [api]);

  return { configured: Boolean(api), client: api, session, ready, busy, message, setMessage: shareMessage, signInWithEmail, verifyEmailCode, signInWithGoogle, signOut, freshSession };
}
