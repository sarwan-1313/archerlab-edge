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
type FetchLike = typeof fetch;

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

  async function refresh(session: CloudSession): Promise<CloudSession> {
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
    storeSession(next);
    return next;
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
      const user = await fetchUser(parsed.tokens.accessToken);
      const session: CloudSession = { ...parsed.tokens, user };
      storeSession(session);
      return { session };
    },

    /** A session that is valid for at least another minute, refreshing if needed. */
    async validSession(): Promise<CloudSession | null> {
      const session = loadSession();
      if (!session) return null;
      if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session;
      try {
        return await refresh(session);
      } catch {
        storeSession(null);
        return null;
      }
    },

    async signOut(): Promise<void> {
      const session = loadSession();
      storeSession(null);
      if (session) await call('/auth/v1/logout', { method: 'POST', token: session.accessToken }).catch(() => undefined);
    },

    async upsert(table: string, rows: unknown[], token: string, onConflict = 'id'): Promise<void> {
      await call(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
        method: 'POST',
        token,
        headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
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
