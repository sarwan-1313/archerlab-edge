/**
 * Sign-in links return to the app with tokens in the URL hash. The router
 * rewrites the URL on start-up, so the hash is captured (and removed from the
 * address bar) before the app renders.
 */
let pending: string | null = null;

export function captureAuthRedirect(): void {
  try {
    const hash = window.location.hash;
    if (!/access_token=|error_description=/.test(hash)) return;
    pending = hash;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  } catch {
    /* Nothing to capture. */
  }
}

export function takePendingAuthRedirect(): string | null {
  const hash = pending;
  pending = null;
  return hash;
}
