import { CLOUD_CONFIG } from './config';

/**
 * Import a clip from cloud storage. On phones the normal "Choose video" button
 * already offers Google Drive, iCloud and Files; these pickers add the same on
 * desktop when the app has been configured with Dropbox or Google keys. The
 * provider scripts load only when the athlete clicks the button.
 */

export type ImportProgress = (loaded: number, total: number | null) => void;

function loadScript(src: string, attributes: Record<string, string> = {}): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${new URL(src).hostname}. Check your connection or ad blocker.`)), { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
      document.head.appendChild(script);
    }
  });
}

const VIDEO_TYPES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo' };

export function guessVideoType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_TYPES[extension] ?? 'video/mp4';
}

/** Downloads a URL into a File, reporting progress. */
export async function downloadAsFile(url: string, name: string, init: RequestInit = {}, onProgress?: ImportProgress): Promise<File> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('The file could not be downloaded. The link may not allow downloads from other sites; download it and choose it from your device instead.');
  }
  if (!response.ok) throw new Error(`The download failed (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || null;
  const type = response.headers.get('content-type')?.split(';')[0] || guessVideoType(name);
  if (!response.body) {
    const blob = await response.blob();
    return new File([blob], name, { type });
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  return new File(chunks, name, { type: type.startsWith('video/') ? type : guessVideoType(name) });
}

interface DropboxFile { name: string; link: string; bytes: number }
interface DropboxApi {
  choose(options: { success: (files: DropboxFile[]) => void; cancel?: () => void; linkType: 'direct' | 'preview'; multiselect: boolean; extensions: string[]; folderselect?: boolean }): void;
}

export async function pickFromDropbox(onProgress?: ImportProgress): Promise<File | null> {
  const appKey = CLOUD_CONFIG.dropboxAppKey;
  if (!appKey) throw new Error('Dropbox import is not configured.');
  await loadScript('https://www.dropbox.com/static/api/2/dropins.js', { id: 'dropboxjs', 'data-app-key': appKey });
  const dropbox = (window as unknown as { Dropbox?: DropboxApi }).Dropbox;
  if (!dropbox) throw new Error('Dropbox could not start.');
  const picked = await new Promise<DropboxFile | null>((resolve) => {
    dropbox.choose({ success: (files) => resolve(files[0] ?? null), cancel: () => resolve(null), linkType: 'direct', multiselect: false, extensions: ['video'], folderselect: false });
  });
  if (!picked) return null;
  return downloadAsFile(picked.link, picked.name, {}, onProgress);
}

interface GoogleTokenResponse { access_token?: string; error?: string }
interface GoogleApis {
  accounts: { oauth2: { initTokenClient(config: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback?: (error: unknown) => void }): { requestAccessToken(options?: { prompt?: string }): void } } };
  picker: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new (viewId?: string) => { setIncludeFolders(include: boolean): unknown; setMimeTypes(types: string): unknown };
    ViewId: { DOCS_VIDEOS: string };
    Action: { PICKED: string; CANCEL: string };
  };
}
interface GooglePickerBuilder {
  addView(view: unknown): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setAppId(id: string): GooglePickerBuilder;
  setCallback(callback: (data: { action: string; docs?: Array<{ id: string; name: string; mimeType?: string; sizeBytes?: number }> }) => void): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

export async function pickFromGoogleDrive(onProgress?: ImportProgress): Promise<File | null> {
  const { googleApiKey, googleClientId, googleAppId } = CLOUD_CONFIG;
  if (!googleApiKey || !googleClientId) throw new Error('Google Drive import is not configured.');
  await Promise.all([loadScript('https://apis.google.com/js/api.js'), loadScript('https://accounts.google.com/gsi/client')]);
  const gapi = (window as unknown as { gapi?: { load(name: string, callback: () => void): void } }).gapi;
  if (!gapi) throw new Error('Google Drive could not start.');
  await new Promise<void>((resolve) => gapi.load('picker', resolve));
  const google = (window as unknown as { google?: GoogleApis }).google;
  if (!google) throw new Error('Google Drive could not start.');
  const token = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => (response.access_token ? resolve(response.access_token) : reject(new Error('Google sign-in was cancelled.'))),
      error_callback: () => reject(new Error('Google sign-in was cancelled.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
  const picked = await new Promise<{ id: string; name: string } | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_VIDEOS);
    let builder = new google.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(googleApiKey).setCallback((data) => {
      if (data.action === google.picker.Action.PICKED && data.docs?.[0]) resolve({ id: data.docs[0].id, name: data.docs[0].name });
      else if (data.action === google.picker.Action.CANCEL) resolve(null);
    });
    if (googleAppId) builder = builder.setAppId(googleAppId);
    builder.build().setVisible(true);
  });
  if (!picked) return null;
  return downloadAsFile(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}?alt=media`, picked.name, { headers: { authorization: `Bearer ${token}` } }, onProgress);
}

/** Imports from a pasted link (works when the host allows cross-site downloads). */
export async function importFromLink(url: string, onProgress?: ImportProgress): Promise<File> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('That does not look like a web link.'); }
  if (parsed.protocol !== 'https:') throw new Error('Only https links can be imported.');
  if (/youtube\.com|youtu\.be|instagram\.com|tiktok\.com/i.test(parsed.hostname)) {
    throw new Error('Videos on YouTube, Instagram or TikTok cannot be downloaded by other sites. Use the original file from your phone or camera instead.');
  }
  const name = decodeURIComponent(parsed.pathname.split('/').pop() || 'video.mp4');
  return downloadAsFile(parsed.toString(), name, {}, onProgress);
}
