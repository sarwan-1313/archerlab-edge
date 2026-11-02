/**
 * Bows and arrows, with sight marks for the distances the archer has shot,
 * and an estimate for distances they have not. Kept on this device (and in
 * the athlete's own Google Drive when they save there).
 */

export const EQUIPMENT_KEY = 'archerlab-edge:equipment';

export interface SightMark { distanceM: number; mark: number }

export interface BowSetup {
  id: string;
  name: string;
  bowType: 'recurve' | 'compound' | 'barebow' | 'traditional' | 'other';
  drawWeightLb: number | null;
  drawLengthIn: number | null;
  arrow: string;
  spine: string;
  arrowLengthIn: number | null;
  pointGrains: number | null;
  notes: string;
  sightMarks: SightMark[];
}

export interface EquipmentData { bows: BowSetup[]; activeBowId: string | null }

export const EMPTY_EQUIPMENT: EquipmentData = { bows: [], activeBowId: null };

export function newBow(name = 'My bow'): BowSetup {
  return { id: `bow:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, bowType: 'recurve', drawWeightLb: null, drawLengthIn: null, arrow: '', spine: '', arrowLengthIn: null, pointGrains: null, notes: '', sightMarks: [] };
}

export function isEquipmentData(value: unknown): value is EquipmentData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<EquipmentData>;
  return Array.isArray(data.bows) && data.bows.every((bow) => bow && typeof bow.id === 'string' && typeof bow.name === 'string' && Array.isArray(bow.sightMarks));
}

export function loadEquipment(storage: Pick<Storage, 'getItem'> = localStorage): EquipmentData {
  try {
    const raw = storage.getItem(EQUIPMENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isEquipmentData(parsed) ? parsed : EMPTY_EQUIPMENT;
  } catch { return EMPTY_EQUIPMENT; }
}

export function saveEquipment(data: EquipmentData, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(EQUIPMENT_KEY, JSON.stringify(data)); } catch { /* lasts for this page only */ }
}

/** Adds or replaces the mark for a distance, keeping the list sorted by distance. */
export function setSightMark(marks: readonly SightMark[], distanceM: number, mark: number): SightMark[] {
  return [...marks.filter((item) => item.distanceM !== distanceM), { distanceM, mark }].sort((a, b) => a.distanceM - b.distanceM);
}

export interface SightEstimate {
  mark: number;
  /** "recorded" for a distance already in the list, "between" when estimated between two recorded marks, "beyond" outside them (less reliable). */
  basis: 'recorded' | 'between' | 'beyond';
}

/** Solves a small linear system by Gaussian elimination. */
function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row, index) => row[n] / a[index][index]);
}

/**
 * Estimates the sight mark for a distance. With two marks it draws a straight
 * line; with three or more it fits a gentle curve (least-squares quadratic),
 * which follows how marks spread out at longer distances. Always check an
 * estimate by shooting.
 */
export function estimateSightMark(marks: readonly SightMark[], distanceM: number): SightEstimate | null {
  const recorded = marks.find((item) => item.distanceM === distanceM);
  if (recorded) return { mark: recorded.mark, basis: 'recorded' };
  const points = [...marks].sort((a, b) => a.distanceM - b.distanceM);
  if (points.length < 2) return null;
  const basis = distanceM > points[0].distanceM && distanceM < points[points.length - 1].distanceM ? 'between' : 'beyond';
  if (points.length === 2) {
    const [p, q] = points;
    const slope = (q.mark - p.mark) / (q.distanceM - p.distanceM);
    return { mark: p.mark + slope * (distanceM - p.distanceM), basis };
  }
  // Least squares for mark = c0 + c1·d + c2·d².
  const sums = [0, 0, 0, 0, 0];
  const rhs = [0, 0, 0];
  for (const { distanceM: d, mark } of points) {
    for (let power = 0; power <= 4; power += 1) sums[power] += d ** power;
    for (let power = 0; power <= 2; power += 1) rhs[power] += mark * d ** power;
  }
  const coefficients = solve([[sums[0], sums[1], sums[2]], [sums[1], sums[2], sums[3]], [sums[2], sums[3], sums[4]]], rhs);
  if (!coefficients) return null;
  const [c0, c1, c2] = coefficients;
  return { mark: c0 + c1 * distanceM + c2 * distanceM * distanceM, basis };
}
