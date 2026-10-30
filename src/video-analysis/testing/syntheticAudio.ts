/**
 * Synthetic range audio for tests: a sharp broadband "thwack" for each release,
 * an optional quieter clicker tick before it, and a duller impact after it,
 * over a little background noise. Test tooling only.
 */
export interface SyntheticAudioEvent {
  t: number;
  kind: 'release' | 'clicker' | 'impact' | 'other';
  gain?: number;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}

export function synthesizeRangeAudio(durationS: number, events: readonly SyntheticAudioEvent[], sampleRate = 16000, seed = 11, noiseLevel = 0.004): Float32Array {
  const samples = new Float32Array(Math.ceil(durationS * sampleRate));
  const rand = random(seed);
  for (let i = 0; i < samples.length; i += 1) samples[i] = rand() * noiseLevel;
  for (const event of events) {
    const start = Math.round(event.t * sampleRate);
    const gain = event.gain ?? (event.kind === 'release' ? 0.8 : event.kind === 'clicker' ? 0.25 : event.kind === 'impact' ? 0.3 : 0.6);
    const decay = event.kind === 'release' ? 0.03 : event.kind === 'clicker' ? 0.006 : event.kind === 'impact' ? 0.05 : 0.04;
    const length = Math.round(decay * 6 * sampleRate);
    let lowPassed = 0;
    for (let k = 0; k < length && start + k < samples.length; k += 1) {
      const envelope = Math.exp(-k / (decay * sampleRate));
      let value = rand();
      if (event.kind === 'impact') {
        lowPassed += 0.08 * (value - lowPassed);
        value = lowPassed * 4;
      } else if (event.kind === 'clicker') {
        value = Math.sin((2 * Math.PI * 4200 * k) / sampleRate) * 0.7 + value * 0.3;
      }
      samples[start + k] += value * gain * envelope;
    }
  }
  return samples;
}
