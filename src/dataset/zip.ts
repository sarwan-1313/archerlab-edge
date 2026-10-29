/**
 * A minimal ZIP writer: stored entries only (no compression), no ZIP64, so the
 * archive must stay under 4 GB and 65 535 files. JPEG frames do not compress
 * further anyway. Format: PKWARE APPNOTE 6.3, local headers + central directory.
 */

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  name: string;
  data: Uint8Array;
  /** Modification time; defaults to now. */
  date?: Date;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date fields (local time, 2-second resolution, years 1980–2107). */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** General purpose flag bit 11: file names are UTF-8. */
const UTF8_FLAG = 0x0800;

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error('Too many files for a ZIP without ZIP64.');
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    if (name.length > 0xffff) throw new Error(`File name too long: ${entry.name}`);
    return { name, data: entry.data, crc: crc32(entry.data), ...dosDateTime(entry.date ?? new Date()) };
  });
  const localSize = prepared.reduce((sum, entry) => sum + LOCAL_HEADER + entry.name.length + entry.data.length, 0);
  const centralSize = prepared.reduce((sum, entry) => sum + CENTRAL_HEADER + entry.name.length, 0);
  const total = localSize + centralSize + END_RECORD;
  if (total > 0xffffffff) throw new Error('The archive is too large for a ZIP without ZIP64.');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 10, true); // version needed: 1.0 (stored)
    view.setUint16(offset + 6, UTF8_FLAG, true);
    view.setUint16(offset + 8, 0, true); // method: stored
    view.setUint16(offset + 10, entry.time, true);
    view.setUint16(offset + 12, entry.date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(entry.name, offset + LOCAL_HEADER);
    out.set(entry.data, offset + LOCAL_HEADER + entry.name.length);
    offset += LOCAL_HEADER + entry.name.length + entry.data.length;
  }

  const centralStart = offset;
  prepared.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 10, true);
    view.setUint16(offset + 8, UTF8_FLAG, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, entry.time, true);
    view.setUint16(offset + 14, entry.date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    // extra length, comment length, disk number, internal and external attributes: all 0
    view.setUint32(offset + 42, offsets[index], true);
    out.set(entry.name, offset + CENTRAL_HEADER);
    offset += CENTRAL_HEADER + entry.name.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}
