export const MIN_PATTERN_SHOTS = 5;
export const MIN_CORRELATION_SHOTS = 8;

export function finite(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

export function mean(values: readonly number[]): number | null {
  const clean = finite(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function median(values: readonly number[]): number | null {
  const clean = finite(values).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

export function standardDeviation(values: readonly number[], sample = true): number | null {
  const clean = finite(values);
  if (clean.length < (sample ? 2 : 1)) return null;
  const center = mean(clean)!;
  return Math.sqrt(clean.reduce((sum, value) => sum + (value - center) ** 2, 0) / (clean.length - (sample ? 1 : 0)));
}

function paired(x: readonly (number | null | undefined)[], y: readonly (number | null | undefined)[]): [number[], number[]] {
  const left: number[] = []; const right: number[] = [];
  for (let index = 0; index < Math.min(x.length, y.length); index += 1) {
    if (typeof x[index] === 'number' && Number.isFinite(x[index]) && typeof y[index] === 'number' && Number.isFinite(y[index])) {
      left.push(x[index] as number); right.push(y[index] as number);
    }
  }
  return [left, right];
}

export function pearsonCorrelation(x: readonly (number | null | undefined)[], y: readonly (number | null | undefined)[]): number | null {
  const [left, right] = paired(x, y);
  if (left.length < 2) return null;
  const mx = mean(left)!; const my = mean(right)!;
  const numerator = left.reduce((sum, value, index) => sum + (value - mx) * (right[index] - my), 0);
  const dx = Math.sqrt(left.reduce((sum, value) => sum + (value - mx) ** 2, 0));
  const dy = Math.sqrt(right.reduce((sum, value) => sum + (value - my) ** 2, 0));
  return dx === 0 || dy === 0 ? null : numerator / (dx * dy);
}

function ranks(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length).fill(0);
  for (let start = 0; start < indexed.length;) {
    let end = start + 1;
    while (end < indexed.length && indexed[end].value === indexed[start].value) end += 1;
    const rank = (start + end - 1) / 2 + 1;
    for (let index = start; index < end; index += 1) result[indexed[index].index] = rank;
    start = end;
  }
  return result;
}

export function spearmanCorrelation(x: readonly (number | null | undefined)[], y: readonly (number | null | undefined)[]): number | null {
  const [left, right] = paired(x, y);
  return left.length < 2 ? null : pearsonCorrelation(ranks(left), ranks(right));
}
