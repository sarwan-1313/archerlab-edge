export class TimeAwareEma {
  private smoothed: number | null = null;
  private timestampMs: number | null = null;
  private readonly timeConstantMs: number;
  private readonly resetGapMs: number;

  constructor(timeConstantMs: number, resetGapMs: number) {
    this.timeConstantMs = timeConstantMs;
    this.resetGapMs = resetGapMs;
  }

  update(value: number | null, timestampMs: number): number | null {
    if (value === null || !Number.isFinite(value)) return this.smoothed;
    if (
      this.smoothed === null ||
      this.timestampMs === null ||
      timestampMs <= this.timestampMs ||
      timestampMs - this.timestampMs > this.resetGapMs
    ) {
      this.smoothed = value;
      this.timestampMs = timestampMs;
      return value;
    }
    const elapsed = timestampMs - this.timestampMs;
    const alpha = 1 - Math.exp(-elapsed / this.timeConstantMs);
    this.smoothed += alpha * (value - this.smoothed);
    this.timestampMs = timestampMs;
    return this.smoothed;
  }

  reset(): void {
    this.smoothed = null;
    this.timestampMs = null;
  }
}
