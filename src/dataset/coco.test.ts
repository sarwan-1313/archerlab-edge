import { describe, expect, it } from 'vitest';
import { buildCocoDataset, buildCocoZip, frameFileName } from './coco';
import type { DatasetBox } from './types';

const box = (label: DatasetBox['label'], x: number, y: number, width: number, height: number): DatasetBox => ({ id: `${label}-${x}`, label, x, y, width, height });

describe('buildCocoDataset', () => {
  const now = new Date('2026-10-29T12:00:00Z');

  it('numbers images and annotations from 1 and maps classes to fixed category ids', () => {
    const dataset = buildCocoDataset([
      { fileName: 'a.jpg', width: 1280, height: 720, boxes: [box('bow', 100, 50, 80, 400), box('target-face', 900, 200, 120, 120)] },
      { fileName: 'b.jpg', width: 1280, height: 720, boxes: [] },
      { fileName: 'c.jpg', width: 1280, height: 720, boxes: [box('arrow', 10.123, 20, 300.456, 8)] },
    ], { now });
    expect(dataset.categories).toEqual([
      { id: 1, name: 'bow', supercategory: 'archery' },
      { id: 2, name: 'arrow', supercategory: 'archery' },
      { id: 3, name: 'target-face', supercategory: 'archery' },
    ]);
    expect(dataset.images).toEqual([
      { id: 1, file_name: 'a.jpg', width: 1280, height: 720 },
      { id: 2, file_name: 'b.jpg', width: 1280, height: 720 },
      { id: 3, file_name: 'c.jpg', width: 1280, height: 720 },
    ]);
    expect(dataset.annotations).toEqual([
      { id: 1, image_id: 1, category_id: 1, bbox: [100, 50, 80, 400], area: 32000, iscrowd: 0 },
      { id: 2, image_id: 1, category_id: 3, bbox: [900, 200, 120, 120], area: 14400, iscrowd: 0 },
      { id: 3, image_id: 3, category_id: 2, bbox: [10.12, 20, 300.46, 8], area: 2403.68, iscrowd: 0 },
    ]);
    expect(dataset.info.date_created).toBe('2026-10-29T12:00:00.000Z');
  });

  it('clips boxes to the image and drops ones with nothing left', () => {
    const dataset = buildCocoDataset([{ fileName: 'a.jpg', width: 640, height: 480, boxes: [box('bow', -20, 400, 100, 200), box('arrow', 700, 10, 50, 50)] }], { now });
    expect(dataset.annotations).toEqual([{ id: 1, image_id: 1, category_id: 1, bbox: [0, 400, 80, 80], area: 6400, iscrowd: 0 }]);
  });
});

describe('buildCocoZip', () => {
  it('puts frames under images/ and labels.json at the root', () => {
    const zip = buildCocoZip([{ fileName: 'a.jpg', width: 10, height: 10, boxes: [box('bow', 1, 1, 5, 5)], jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }]);
    const text = new TextDecoder('latin1').decode(zip);
    expect(text).toContain('images/a.jpg');
    const start = text.indexOf('labels.json') + 'labels.json'.length;
    const json = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    expect(json.images[0].file_name).toBe('a.jpg');
    expect(json.annotations).toHaveLength(1);
  });
});

describe('frameFileName', () => {
  it('makes a safe, sortable name from the clip and time', () => {
    expect(frameFileName('My clip (1).mp4', 12.3456)).toBe('My_clip_1_0012346ms.jpg');
    expect(frameFileName('.mov', 0)).toBe('clip_0000000ms.jpg');
  });
});
