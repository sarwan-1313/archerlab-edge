import { VIDEO_CONFIG } from './config';
import { mad, median, percentile } from './signal';
import type { AudioOnset } from './types';

/**
 * Audio side of the video engine. A bow release is a sharp broadband transient,
 * a clicker is a short high click just before it, and the arrow hitting the
 * boss is a duller thud a fraction of a second later. We find transients with
 * high-band spectral flux, then attribute them to shots using the video timing.
 */

type AudioConfig = typeof VIDEO_CONFIG.audio;

const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>();

function twiddles(n: number) {
  let table = twiddleCache.get(n);
  if (!table) {
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k += 1) {
      cos[k] = Math.cos((-2 * Math.PI * k) / n);
      sin[k] = Math.sin((-2 * Math.PI * k) / n);
    }
    table = { cos, sin };
    twiddleCache.set(n, table);
  }
  return table;
}

/** In-place iterative radix-2 FFT. `re` and `im` must have a power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  const { cos: cosTable, sin: sinTable } = twiddles(n);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k += 1) {
        const cos = cosTable[k * stride];
        const sin = sinTable[k * stride];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * cos - im[b] * sin;
        const ti = re[b] * sin + im[b] * cos;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

export interface OnsetAnalysis {
  onsets: AudioOnset[];
  noiseFloorDb: number;
  frameTimes: number[];
  flux: number[];
}

function toDb(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-9));
}

/** Detects sharp transients in a mono signal. */
export function detectOnsets(signal: Float32Array, sampleRate: number, config: AudioConfig = VIDEO_CONFIG.audio): OnsetAnalysis {
  const n = config.fftSize;
  const hop = config.hop;
  const frames = signal.length >= n ? Math.floor((signal.length - n) / hop) + 1 : 0;
  const window = new Float64Array(n);
  for (let i = 0; i < n; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const lowBin = Math.max(1, Math.round((config.bandLowHz / sampleRate) * n));
  const bins = n / 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let previous = new Float64Array(bins + 1);
  let current = new Float64Array(bins + 1);
  const flux: number[] = [];
  const rmsDb: number[] = [];
  const centroids: number[] = [];
  const frameTimes: number[] = [];

  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * hop;
    let energy = 0;
    for (let i = 0; i < n; i += 1) {
      const value = signal[offset + i];
      energy += value * value;
      re[i] = value * window[i];
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    let weighted = 0;
    let total = 0;
    for (let k = 1; k <= bins; k += 1) {
      const magnitude = Math.hypot(re[k], im[k]) / bins;
      current[k] = Math.log1p(1000 * magnitude);
      if (k >= lowBin) {
        const rise = current[k] - previous[k];
        if (rise > 0) sum += rise;
      }
      weighted += magnitude * k;
      total += magnitude;
    }
    flux.push(frame === 0 ? 0 : sum);
    rmsDb.push(toDb(Math.sqrt(energy / n)));
    centroids.push(total > 0 ? (weighted / total) * (sampleRate / n) : 0);
    frameTimes.push(offset / sampleRate);
    [previous, current] = [current, previous];
  }

  const noiseFloorDb = rmsDb.length ? percentile(rmsDb, 0.2) : -120;
  if (!flux.length) return { onsets: [], noiseFloorDb, frameTimes, flux };
  const maxFlux = Math.max(...flux);
  if (!(maxFlux > 0)) return { onsets: [], noiseFloorDb, frameTimes, flux };
  const globalSpread = mad(flux) + 1e-6;
  const frameRate = sampleRate / hop;
  const thresholdHalf = Math.max(1, Math.round(config.thresholdHalfWindowS * frameRate));
  const peakHalf = Math.max(1, Math.round(config.peakHalfWindowS * frameRate));

  const candidates: AudioOnset[] = [];
  for (let frame = 1; frame < flux.length - 1; frame += 1) {
    const value = flux[frame];
    const strength = value / maxFlux;
    if (strength < config.minStrength) continue;
    let isPeak = true;
    for (let k = Math.max(0, frame - peakHalf); k <= Math.min(flux.length - 1, frame + peakHalf); k += 1) {
      if (flux[k] > value || (flux[k] === value && k < frame)) { isPeak = false; break; }
    }
    if (!isPeak) continue;
    const local = flux.slice(Math.max(0, frame - thresholdHalf), Math.min(flux.length, frame + thresholdHalf + 1));
    if (value <= median(local) + config.thresholdK * globalSpread) continue;
    candidates.push(describeOnset(signal, sampleRate, frame * hop, n, strength, centroids[frame]));
  }

  // Enforce a minimum spacing, keeping the stronger transient.
  const onsets: AudioOnset[] = [];
  for (const candidate of candidates) {
    const last = onsets.at(-1);
    if (last && candidate.t - last.t < config.minSpacingS) {
      if (candidate.strength > last.strength) onsets[onsets.length - 1] = candidate;
      continue;
    }
    onsets.push(candidate);
  }
  return { onsets, noiseFloorDb, frameTimes, flux };
}

/** Refines a transient to the first sample that reaches half its local peak, and measures it. */
function describeOnset(signal: Float32Array, sampleRate: number, frameStart: number, n: number, strength: number, centroidHz: number): AudioOnset {
  const searchStart = Math.max(0, frameStart - n / 2);
  const searchEnd = Math.min(signal.length, frameStart + n);
  let peak = 0;
  let peakIndex = searchStart;
  for (let i = searchStart; i < searchEnd; i += 1) {
    const value = Math.abs(signal[i]);
    if (value > peak) { peak = value; peakIndex = i; }
  }
  let onsetIndex = peakIndex;
  for (let i = peakIndex; i >= searchStart; i -= 1) {
    if (Math.abs(signal[i]) >= peak * 0.5) onsetIndex = i;
    else if (peakIndex - i > sampleRate * 0.004) break;
  }
  // Decay: time for a 2 ms envelope to fall 20 dB below the peak.
  const envelopeWindow = Math.max(1, Math.round(sampleRate * 0.002));
  const limit = Math.min(signal.length, peakIndex + Math.round(sampleRate * 0.5));
  let decayS = 0.5;
  for (let i = peakIndex; i < limit; i += envelopeWindow) {
    let localPeak = 0;
    for (let k = i; k < Math.min(limit, i + envelopeWindow); k += 1) localPeak = Math.max(localPeak, Math.abs(signal[k]));
    if (localPeak < peak * 0.1) { decayS = (i - peakIndex) / sampleRate; break; }
  }
  return { t: onsetIndex / sampleRate, strength, peakDb: toDb(peak), centroidHz, decayS };
}

export interface ShotAudioMatch {
  release?: AudioOnset;
  clicker?: AudioOnset;
  impact?: AudioOnset;
}

/**
 * Attributes transients around one visually detected release. The strongest
 * transient near the visual release is the shot; a weaker, short click shortly
 * before it may be a clicker; a later transient may be the arrow landing.
 */
export function matchShotAudio(visualRelease: number, onsets: readonly AudioOnset[], used: Set<number>, config: AudioConfig = VIDEO_CONFIG.audio): ShotAudioMatch {
  const releaseCandidates = onsets
    .map((onset, index) => ({ onset, index }))
    .filter(({ onset, index }) => !used.has(index) && onset.t >= visualRelease - config.releaseMatchBeforeS && onset.t <= visualRelease + config.releaseMatchAfterS)
    .sort((a, b) => b.onset.strength - a.onset.strength);
  const best = releaseCandidates[0];
  if (!best) return {};
  used.add(best.index);
  const release = best.onset;
  const match: ShotAudioMatch = { release };
  const clicker = onsets
    .map((onset, index) => ({ onset, index }))
    .filter(({ onset, index }) => !used.has(index)
      && release.t - onset.t >= config.clickerWindowS[0] && release.t - onset.t <= config.clickerWindowS[1]
      && onset.strength >= release.strength * 0.08 && onset.strength <= release.strength * 0.9
      && onset.decayS <= 0.12)
    .sort((a, b) => b.onset.t - a.onset.t)[0];
  if (clicker) { used.add(clicker.index); match.clicker = clicker.onset; }
  // The arrow landing is the first clear transient after the shot (another archer's shot is usually louder and later).
  const impact = onsets
    .map((onset, index) => ({ onset, index }))
    .filter(({ onset, index }) => !used.has(index)
      && onset.t - release.t >= config.impactWindowS[0] && onset.t - release.t <= config.impactWindowS[1]
      && onset.strength >= release.strength * 0.12 && onset.strength <= release.strength * 0.85)
    .sort((a, b) => a.onset.t - b.onset.t)[0];
  if (impact) { used.add(impact.index); match.impact = impact.onset; }
  return match;
}
