export function createShotId(now = Date.now()): string {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `shot_${now}_${random}`;
}
