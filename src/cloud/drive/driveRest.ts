/**
 * A small Google Drive v3 client over plain fetch (no Google SDK). It only
 * ever sees files this app created, because the token has the drive.file
 * scope: the athlete's other Drive files stay out of reach.
 */

export const DRIVE_FOLDER_NAME = 'ArcherLab Edge';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
/** Google's limit for a single multipart upload; anything larger goes through a resumable upload. */
export const MULTIPART_LIMIT_BYTES = 5 * 1024 * 1024;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

/** Drive refused the token: it has expired or access was removed. The athlete needs to reconnect. */
export class DriveAuthError extends Error {
  constructor() {
    super('Your Google Drive connection has expired. Press “Connect Google Drive” to continue.');
    this.name = 'DriveAuthError';
  }
}

export class DriveError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

export interface UploadOptions {
  name: string;
  mimeType: string;
  body: Blob;
  /** Overwrite this file instead of creating a new one. */
  existingId?: string;
  appProperties?: Record<string, string>;
}

export interface DriveRest {
  ensureFolder(name?: string): Promise<string>;
  listFiles(folderId: string): Promise<DriveFile[]>;
  upload(folderId: string, options: UploadOptions): Promise<DriveFile>;
  download(fileId: string): Promise<Blob>;
  remove(fileId: string): Promise<void>;
}

const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,appProperties';

async function failure(response: Response): Promise<Error> {
  if (response.status === 401) return new DriveAuthError();
  let detail = '';
  try {
    const body = await response.json() as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch { /* no JSON body */ }
  if (response.status === 403 && /quota|storage/i.test(detail)) return new DriveError('Your Google Drive is full. Free some space in Drive, then try again.', 403);
  if (response.status === 403 && /has not been used|disabled/i.test(detail)) return new DriveError('The Google Drive API is not switched on for this copy of ArcherLab. Whoever deployed it needs to enable it (see docs/cloud-setup.md).', 403);
  return new DriveError(`Google Drive returned an error (${response.status})${detail ? `: ${detail}` : ''}.`, response.status);
}

/** Escapes a value inside a Drive search query string. */
const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function createDriveRest(getToken: () => string | null, fetcher: typeof fetch = (...args) => fetch(...args)): DriveRest {
  const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = getToken();
    if (!token) throw new DriveAuthError();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetcher(url, { ...init, headers });
    } catch {
      throw new DriveError('Google Drive could not be reached. Check your connection and try again.', 0);
    }
    if (!response.ok) throw await failure(response);
    return response;
  };

  const metadataFor = (folderId: string, options: UploadOptions) => (options.existingId
    // Parents cannot be set when updating; the file is already in the folder.
    ? { name: options.name, mimeType: options.mimeType, appProperties: options.appProperties }
    : { name: options.name, mimeType: options.mimeType, parents: [folderId], appProperties: options.appProperties });

  const multipart = async (folderId: string, options: UploadOptions): Promise<DriveFile> => {
    const boundary = `archerlab${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadataFor(folderId, options)),
      `\r\n--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`,
      options.body,
      `\r\n--${boundary}--`,
    ]);
    const target = options.existingId ? `${UPLOAD}/files/${encodeURIComponent(options.existingId)}` : `${UPLOAD}/files`;
    const response = await call(`${target}?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: options.existingId ? 'PATCH' : 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return response.json() as Promise<DriveFile>;
  };

  const resumable = async (folderId: string, options: UploadOptions): Promise<DriveFile> => {
    const target = options.existingId ? `${UPLOAD}/files/${encodeURIComponent(options.existingId)}` : `${UPLOAD}/files`;
    const start = await call(`${target}?uploadType=resumable&fields=${FILE_FIELDS}`, {
      method: options.existingId ? 'PATCH' : 'POST',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': options.mimeType,
        'x-upload-content-length': String(options.body.size),
      },
      body: JSON.stringify(metadataFor(folderId, options)),
    });
    const session = start.headers.get('location');
    if (!session) throw new DriveError('Google Drive did not start the upload. Try again.', start.status);
    const response = await call(session, { method: 'PUT', headers: { 'content-type': options.mimeType }, body: options.body });
    return response.json() as Promise<DriveFile>;
  };

  return {
    async ensureFolder(name = DRIVE_FOLDER_NAME) {
      const q = `name = ${quote(name)} and mimeType = '${FOLDER_TYPE}' and trashed = false`;
      const found = await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive&pageSize=1`);
      const { files } = await found.json() as { files?: Array<{ id: string }> };
      if (files?.[0]) return files[0].id;
      const created = await call(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name, mimeType: FOLDER_TYPE }),
      });
      return (await created.json() as { id: string }).id;
    },

    async listFiles(folderId) {
      const q = `${quote(folderId)} in parents and trashed = false`;
      const all: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const page = await call(`${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${FILE_FIELDS})&spaces=drive&pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
        const body = await page.json() as { files?: DriveFile[]; nextPageToken?: string };
        all.push(...(body.files ?? []));
        pageToken = body.nextPageToken;
      } while (pageToken);
      return all;
    },

    upload(folderId, options) {
      return options.body.size > MULTIPART_LIMIT_BYTES ? resumable(folderId, options) : multipart(folderId, options);
    },

    async download(fileId) {
      const response = await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
      return response.blob();
    },

    async remove(fileId) {
      await call(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    },
  };
}
