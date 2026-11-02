let audio: AudioContext | null = null;

/** Plays short whistle-like beeps. Sound is a convenience: any failure is ignored. */
export function beep(count: number, frequency = 2900): void {
  if (!count) return;
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    for (let index = 0; index < count; index += 1) {
      const start = audio.currentTime + index * 0.45;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.34);
    }
  } catch { /* ignore */ }
}
