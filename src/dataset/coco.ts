import { createZip, type ZipEntry } from './zip';
import { DATASET_CLASSES, type DatasetBox } from './types';

/**
 * COCO object-detection export: images/ plus labels.json, the layout MediaPipe
 * Model Maker's `Dataset.from_coco_folder` reads and that YOLOX converts from
 * (docs/bow-detection.md). Category ids start at 1; frames with no boxes are
 * kept as negative examples.
 */

export interface CocoImage { id: number; file_name: string; width: number; height: number }
export interface CocoAnnotation { id: number; image_id: number; category_id: number; bbox: [number, number, number, number]; area: number; iscrowd: 0 }
export interface CocoCategory { id: number; name: string; supercategory: string }
export interface CocoDataset {
  info: { description: string; version: string; date_created: string };
  licenses: [];
  images: CocoImage[];
  annotations: CocoAnnotation[];
  categories: CocoCategory[];
}

export interface ExportFrame {
  fileName: string;
  width: number;
  height: number;
  boxes: readonly DatasetBox[];
}

export const COCO_CATEGORIES: CocoCategory[] = DATASET_CLASSES.map((name, index) => ({ id: index + 1, name, supercategory: 'archery' }));

const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildCocoDataset(frames: readonly ExportFrame[], { description = 'ArcherLab Edge bow detection dataset', now = new Date() }: { description?: string; now?: Date } = {}): CocoDataset {
  const images: CocoImage[] = [];
  const annotations: CocoAnnotation[] = [];
  frames.forEach((frame, index) => {
    const imageId = index + 1;
    images.push({ id: imageId, file_name: frame.fileName, width: frame.width, height: frame.height });
    for (const box of frame.boxes) {
      // Clip to the image so a box dragged past the edge stays valid.
      const x0 = Math.max(0, Math.min(frame.width, box.x));
      const y0 = Math.max(0, Math.min(frame.height, box.y));
      const x1 = Math.max(0, Math.min(frame.width, box.x + box.width));
      const y1 = Math.max(0, Math.min(frame.height, box.y + box.height));
      const width = round2(x1 - x0);
      const height = round2(y1 - y0);
      if (width < 1 || height < 1) continue;
      annotations.push({
        id: annotations.length + 1,
        image_id: imageId,
        category_id: DATASET_CLASSES.indexOf(box.label) + 1,
        bbox: [round2(x0), round2(y0), width, height],
        area: round2(width * height),
        iscrowd: 0,
      });
    }
  });
  return {
    info: { description, version: '1', date_created: now.toISOString() },
    licenses: [],
    images,
    annotations,
    categories: COCO_CATEGORIES,
  };
}

/** The ZIP: images/<fileName> for each frame plus labels.json at the root. */
export function buildCocoZip(frames: ReadonlyArray<ExportFrame & { jpeg: Uint8Array }>, options?: Parameters<typeof buildCocoDataset>[1]): Uint8Array {
  const dataset = buildCocoDataset(frames, options);
  const entries: ZipEntry[] = frames.map((frame) => ({ name: `images/${frame.fileName}`, data: frame.jpeg }));
  entries.push({ name: 'labels.json', data: new TextEncoder().encode(JSON.stringify(dataset, null, 2)) });
  return createZip(entries);
}

/** A file name for a frame: the clip's name and the time in milliseconds, so names stay unique across clips. */
export function frameFileName(clipName: string, t: number): string {
  const stem = clipName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'clip';
  return `${stem}_${String(Math.round(t * 1000)).padStart(7, '0')}ms.jpg`;
}
