import { describe, expect, it } from 'vitest';
import { crc32, createZip, dosDateTime } from './zip';

/** Reads a stored ZIP back through its central directory, checking each local header agrees. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  expect(offset + centralSize).toBe(end);
  const decoder = new TextDecoder();
  const files: Array<{ name: string; data: Uint8Array; crc: number; flags: number }> = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const flags = view.getUint16(offset + 8, true);
    expect(view.getUint16(offset + 10, true)).toBe(0);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 20, true);
    expect(view.getUint32(offset + 24, true)).toBe(size);
    const nameLength = view.getUint16(offset + 28, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint32(local + 14, true)).toBe(crc);
    expect(view.getUint32(local + 18, true)).toBe(size);
    const localName = view.getUint16(local + 26, true);
    const start = local + 30 + localName + view.getUint16(local + 28, true);
    expect(decoder.decode(zip.subarray(local + 30, local + 30 + localName))).toBe(name);
    files.push({ name, data: zip.slice(start, start + size), crc, flags });
    offset += 46 + nameLength;
  }
  return files;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('dosDateTime', () => {
  it('packs local time with two-second resolution and clamps to 1980', () => {
    expect(dosDateTime(new Date(2026, 9, 29, 13, 45, 31))).toEqual({ time: (13 << 11) | (45 << 5) | 15, date: (46 << 9) | (10 << 5) | 29 });
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });
});

describe('createZip', () => {
  it('writes an empty archive as just the end record', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });

  it('stores files uncompressed with correct sizes, CRCs and UTF-8 names', () => {
    const bytes = new Uint8Array(1000).map((_, index) => (index * 31) & 0xff);
    const zip = createZip([
      { name: 'images/a.jpg', data: bytes },
      { name: 'labels.json', data: new TextEncoder().encode('{"ok":true}') },
      { name: 'café.txt', data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = readZip(zip);
    expect(files.map((file) => file.name)).toEqual(['images/a.jpg', 'labels.json', 'café.txt']);
    expect(files[0].data).toEqual(bytes);
    expect(files[0].crc).toBe(crc32(bytes));
    expect(new TextDecoder().decode(files[1].data)).toBe('{"ok":true}');
    expect(files.every((file) => file.flags & 0x0800)).toBe(true);
    expect(zip.length).toBe(30 * 3 + 46 * 3 + 22 + 2 * (12 + 11 + 9) + 1000 + 11 + 3);
  });
});
