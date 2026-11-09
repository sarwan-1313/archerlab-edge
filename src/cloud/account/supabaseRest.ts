/**
 * A small Supabase client over plain REST (Auth, PostgREST and Storage), so
 * the app needs no extra dependency. Row-level security on the tables makes
 * every row readable and writable only by its owner (see docs/cloud-setup.md).
 */

export interface CloudUser { id: string; email?: string }

/** An entry from a storage folder listing; sub-folders have no id. */
export interface StorageEntry { name: string; id: string | null }

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
  user: CloudUser;
}

export class CloudError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CloudError';
    this.status = status;
  }
}

const SESSION_KEY = 'archerlab-edge:cloud-session';
/** How the auth server answers a refresh token it does not accept (unknown, already used, expired or revoked). */
const REFRESH_REFUSED = new Set([400, 401, 403]);
type FetchLike = typeof fetch;

/** The user named in an access token (a JWT), for when the user lookup cannot be reached. Not verified here: the server checks the token on every call. */
export function userFromAccessToken(accessToken: string): CloudUser | null {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const claims = JSON.parse(json) as { sub?: unknown; email?: unknown };
    if (typeof claims.sub !== 'string' || !claims.sub) return null;
    return { id: claims.sub, email: typeof claims.email === 'string' && claims.email ? claims.email : undefined };
  } catch {
    return null;
  }
}

/** Reads auth tokens from a redirect URL hash (magic link or OAuth, implicit flow). */
export function parseAuthRedirect(hash: string, nowSeconds = Math.floor(Date.now() / 1000)): { tokens?: Omit<CloudSession, 'user'>; error?: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const error = params.get('error_description') ?? params.get('error');
  if (error) return { error: error.replace(/\+/g, ' ') };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const expiresAt = Number(params.get('expires_at')) || nowSeconds + (Number(params.get('expires_in')) || 3600);
  return { tokens: { accessToken, refreshToken, expiresAt } };
}

export function createSupabaseRest(baseUrl: string, anonKey: string, fetcher: FetchLike = (...args) => fetch(...args)) {
  const authHeaders = (token?: string): Record<string, string> => ({
    apikey: anonKey,
    authorization: `Bearer ${token ?? anonKey}`,
  });

  async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
    const { token, headers, ...rest } = init;
    const response = await fetcher(`${baseUrl}${path}`, { ...rest, headers: { ...authHeaders(token), ...(headers as Record<string, string> | undefined) } });
    const text = await response.text();
    const body = text ? (() => { try { return JSON.parse(text) as unknown; } catch { return text; } })() : null;
    if (!response.ok) {
      const data = body as { msg?: string; message?: string; error_description?: string; error?: string } | null;
      const message = data && typeof data === 'object' ? data.msg ?? data.message ?? data.error_description ?? data.error : typeof body === 'string' ? body : '';
      throw new CloudError(message || `Request failed (${response.status})`, response.status);
    }
    return body as T;
  }

  function loadSession(): CloudSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) as CloudSession : null;
    } catch {
      return null;
    }
  }

  function storeSession(session: CloudSession | null) {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* Session then lasts only for this page. */ }
  }

  async function fetchUser(accessToken: string): Promise<CloudUser> {
    const user = await call<{ id: string; email?: string }>('/auth/v1/user', { token: accessToken });
    return { id: user.id, email: user.email };
  }

  /** New tokens for a session. Stores nothing. */
  async function requestRefresh(session: CloudSession): Promise<CloudSession> {
    const data = await call<{ access_token: string; refresh_token: string; expires_at?: number; expires_in?: number; user?: { id: string; email?: string } }>(
      '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refreshToken }) },
    );
    const next: CloudSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      user: data.user ? { id: data.user.id, email: data.user.email } : session.user,
    };
    return next;
  }

  // Supabase rotates the refresh token on every use, so two refreshes with the same token race: the second is
  // refused as "already used". Calls that need a refresh at the same time share one request instead.
  let refreshing: Promise<CloudSession | null> | null = null;
  // Bumped on sign-out, so a refresh that finishes afterwards does not store the old session again.
  let generation = 0;

  async function refreshStored(session: CloudSession): Promise<CloudSession | null> {
    const started = generation;
    try {
      const next = await requestRefresh(session);
      if (generation !== started) return null;
      storeSession(next);
      return next;
    } catch (error) {
      if (generation !== started) return null;
      // Only the server refusing the refresh token ends the session. Offline, a timeout, rate limiting or an
      // outage just means it cannot be refreshed right now: the error goes to the caller and the athlete stays
      // signed in.
      if (!(error instanceof CloudError) || !REFRESH_REFUSED.has(error.status)) throw error;
      // Another tab may have refreshed with the same token a moment ago; its new session is not refused.
      const latest = loadSession();
      if (latest && latest.refreshToken !== session.refreshToken) return latest;
      storeSession(null);
      return null;
    }
  }

  async function removeObjects(bucket: string, paths: string[], token: string): Promise<void> {
    await call(`/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      token,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
  }

  return {
    loadSession,

    /** Sends a sign-in link by email. */
    async signInWithEmail(email: string, redirectTo: string): Promise<void> {
      await call(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, create_user: true }),
      });
    },

    /** URL that starts an OAuth sign-in (e.g. Google) and returns to `redirectTo`. */
    oauthUrl(provider: 'google', redirectTo: string): string {
      return `${baseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
    },

    /** Completes a sign-in when the page loads with tokens in the URL hash. */
    async consumeRedirect(hash: string): Promise<{ session?: CloudSession; error?: string } | null> {
      const parsed = parseAuthRedirect(hash);
      if (!parsed) return null;
      if (parsed.error || !parsed.tokens) return { error: parsed.error ?? 'Sign-in failed.' };
      let user: CloudUser;
      try {
        user = await fetchUser(parsed.tokens.accessToken);
      } catch (error) {
        // The link is used up once the page has read it, so do not throw the tokens away over a network hiccup:
        // the token itself names the user. Only a token the server refuses fails the sign-in.
        const fromToken = error instanceof CloudError && REFRESH_REFUSED.has(error.status) ? null : userFromAccessToken(parsed.tokens.accessToken);
        if (!fromToken) throw error;
        user = fromToken;
      }
      const session: CloudSession = { ...parsed.tokens, user };
      storeSession(session);
      return { session };
    },

    /**
     * A session that is valid for at least another minute, refreshing if needed. Null means signed out (no
     * session, or the server refused it). When the session cannot be refreshed right now (offline, timeout,
     * outage), this throws and the stored session is kept, so a bad connection never signs anyone out.
     */
    async validSession(): Promise<CloudSession | null> {
      const session = loadSession();
      if (!session) return null;
      if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session;
      if (!refreshing) {
        const shared: Promise<CloudSession | null> = refreshStored(session).finally(() => { if (refreshing === shared) refreshing = null; });
        refreshing = shared;
      }
      return refreshing;
    },

    /** Ends the session on this device at once, then on the server. */
    async signOut(): Promise<void> {
      const session = loadSession();
      generation += 1;
      refreshing = null;
      storeSession(null);
      if (!session) return;
      const logout = (token: string) => call('/auth/v1/logout', { method: 'POST', token });
      try {
        await logout(session.accessToken);
      } catch (error) {
        // An expired access token cannot end the session on the server: get a fresh one (without storing it)
        // and try once more, so the refresh token is revoked rather than left alive.
        if (!(error instanceof CloudError) || error.status !== 401) return;
        try {
          const next = await requestRefresh(session);
          await logout(next.accessToken);
        } catch { /* Signed out on this device either way. */ }
      }
    },

    async upsert(table: string, rows: unknown[], token: string, onConflict = 'id'): Promise<void> {
      await call(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        token,
        headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
    },

    /** Inserts rows and returns them as stored. With `onConflict`, a row that already exists is updated instead. */
    async insert<T>(table: string, rows: unknown[], token: string, onConflict?: string): Promise<T[]> {
      return call<T[]>(`/rest/v1/${table}${onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ''}`, {
        method: 'POST',
        token,
        headers: { 'content-type': 'application/json', prefer: onConflict ? 'resolution=merge-duplicates,return=representation' : 'return=representation' },
        body: JSON.stringify(rows),
      });
    },

    /** Updates the rows matching `filter` and returns them as stored. */
    async update<T>(table: string, filter: string, patch: Record<string, unknown>, token: string): Promise<T[]> {
      return call<T[]>(`/rest/v1/${table}?${filter}`, {
        method: 'PATCH',
        token,
        headers: { 'content-type': 'application/json', prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
    },

    async select<T>(table: string, query: string, token: string): Promise<T[]> {
      return call<T[]>(`/rest/v1/${table}?${query}`, { token });
    },

    async remove(table: string, filter: string, token: string): Promise<void> {
      await call(`/rest/v1/${table}?${filter}`, { method: 'DELETE', token });
    },

    async upload(bucket: string, path: string, blob: Blob, token: string): Promise<void> {
      await call(`/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        token,
        headers: { 'content-type': blob.type || 'application/octet-stream', 'x-upsert': 'true' },
        body: blob,
      });
    },

    async signedUrl(bucket: string, path: string, token: string, expiresIn = 3600): Promise<string> {
      const data = await call<{ signedURL?: string; signedUrl?: string }>(`/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        token,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      });
      const relative = data.signedURL ?? data.signedUrl ?? '';
      return relative.startsWith('http') ? relative : `${baseUrl}/storage/v1${relative}`;
    },

    async removeObject(bucket: string, path: string, token: string): Promise<void> {
      await removeObjects(bucket, [path], token);
    },

    removeObjects,

    /** One page of a storage folder; `prefix` is the folder, e.g. "<user id>/". */
    async listObjects(bucket: string, prefix: string, token: string, page: { limit: number; offset: number }): Promise<StorageEntry[]> {
      const entries = await call<StorageEntry[] | null>(`/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        token,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, limit: page.limit, offset: page.offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      return entries ?? [];
    },

    /** Calls a Postgres function exposed by PostgREST. */
    async rpc<T = void>(fn: string, args: Record<string, unknown>, token: string): Promise<T> {
      return call<T>(`/rest/v1/rpc/${fn}`, {
        method: 'POST',
        token,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
    },
  };
}

export type SupabaseRest = ReturnType<typeof createSupabaseRest>;
