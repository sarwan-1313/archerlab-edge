/**
 * Optional cloud features are switched on by build-time environment variables
 * (see docs/cloud-setup.md). With none set, ArcherLab stays fully on-device and
 * these features simply do not appear.
 */
const env = import.meta.env as Record<string, string | undefined>;

const value = (name: string): string | null => {
  const raw = env[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
};

export const CLOUD_CONFIG = {
  supabaseUrl: value('VITE_SUPABASE_URL')?.replace(/\/$/, '') ?? null,
  supabaseAnonKey: value('VITE_SUPABASE_ANON_KEY'),
  videoBucket: value('VITE_SUPABASE_VIDEO_BUCKET') ?? 'videos',
  /** Supabase's default per-file upload limit on the free plan. */
  maxVideoUploadBytes: Number(value('VITE_SUPABASE_MAX_UPLOAD_MB') ?? 50) * 1024 * 1024,
  dropboxAppKey: value('VITE_DROPBOX_APP_KEY'),
  googleApiKey: value('VITE_GOOGLE_API_KEY'),
  googleClientId: value('VITE_GOOGLE_CLIENT_ID'),
  googleAppId: value('VITE_GOOGLE_APP_ID'),
};

export const accountsEnabled = Boolean(CLOUD_CONFIG.supabaseUrl && CLOUD_CONFIG.supabaseAnonKey);
export const dropboxEnabled = Boolean(CLOUD_CONFIG.dropboxAppKey);
export const googleDriveEnabled = Boolean(CLOUD_CONFIG.googleApiKey && CLOUD_CONFIG.googleClientId);
