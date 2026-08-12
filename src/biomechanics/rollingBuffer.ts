export type Timestamped = { timestampMs: number };

export class RollingTimeBuffer<T extends Timestamped> {
  private samples: T[] = [];
  private readonly windowDurationMs: number;

  constructor(windowDurationMs: number) {
    this.windowDurationMs = windowDurationMs;
  }

  push(sample: T): void {
    if (!Number.isFinite(sample.timestampMs)) return;
    const latest = this.samples.at(-1);
    if (latest && sample.timestampMs <= latest.timestampMs) return;
    this.samples.push(sample);
    this.prune(sample.timestampMs);
  }

  prune(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    const cutoff = nowMs - this.windowDurationMs;
    const firstValid = this.samples.findIndex((sample) => sample.timestampMs >= cutoff);
    if (firstValid === -1) this.samples = [];
    else if (firstValid > 0) this.samples.splice(0, firstValid);
  }

  clear(): void {
    this.samples = [];
  }

  values(): readonly T[] {
    return this.samples;
  }

  get length(): number {
    return this.samples.length;
  }

  get durationMs(): number {
    if (this.samples.length < 2) return 0;
    return this.samples.at(-1)!.timestampMs - this.samples[0].timestampMs;
  }
}
