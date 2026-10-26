import { useCallback, useEffect, useState } from 'react';
import { CLOUD_CONFIG, accountsEnabled } from '../config';
import { takePendingAuthRedirect } from './authRedirect';
import { describeCloudError } from './cloudSync';
import { createSupabaseRest, type CloudSession, type SupabaseRest } from './supabaseRest';

let client: SupabaseRest | null = null;

export function cloudClient(): SupabaseRest | null {
  if (!accountsEnabled) return null;
  if (!client) client = createSupabaseRest(CLOUD_CONFIG.supabaseUrl as string, CLOUD_CONFIG.supabaseAnonKey as string);
  return client;
}

const listeners = new Set<(session: CloudSession | null) => void>();
let currentSession: CloudSession | null = null;
let initialised = false;

function publish(session: CloudSession | null) {
  currentSession = session;
  listeners.forEach((listener) => listener(session));
}

/** Optional sign-in. Returns `configured: false` when the deployment has no cloud project. */
export function useCloudAccount() {
  const [session, setSession] = useState<CloudSession | null>(currentSession);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const api = cloudClient();

  useEffect(() => {
    listeners.add(setSession);
    if (api && !initialised) {
      initialised = true;
      const hash = takePendingAuthRedirect();
      (async () => {
        try {
          if (hash) {
            const result = await api.consumeRedirect(hash);
            if (result?.error) setMessage(`Sign-in failed: ${result.error}`);
            if (result?.session) { publish(result.session); setMessage('Signed in.'); return; }
          }
          publish(await api.validSession());
        } catch (error) {
          setMessage(describeCloudError(error));
        }
      })();
    }
    return () => { listeners.delete(setSession); };
  }, [api]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!api) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.signInWithEmail(email, `${window.location.origin}/profile`);
      setMessage(`Check ${email} for a sign-in link.`);
    } catch (error) {
      setMessage(describeCloudError(error));
    } finally {
      setBusy(false);
    }
  }, [api]);

  const signInWithGoogle = useCallback(() => {
    if (api) window.location.assign(api.oauthUrl('google', `${window.location.origin}/profile`));
  }, [api]);

  const signOut = useCallback(async () => {
    if (!api) return;
    await api.signOut();
    publish(null);
    setMessage('Signed out. Your data on this device is unchanged.');
  }, [api]);

  /** A fresh session for an API call, or null when signed out. */
  const freshSession = useCallback(async () => {
    if (!api) return null;
    const valid = await api.validSession();
    if (!valid) publish(null);
    return valid;
  }, [api]);

  return { configured: Boolean(api), client: api, session, busy, message, setMessage, signInWithEmail, signInWithGoogle, signOut, freshSession };
}
