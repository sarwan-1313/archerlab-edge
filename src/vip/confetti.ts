/** A short burst of gold and target-coloured confetti over the page. Skipped when the athlete prefers less motion. */
export function confetti(origin: { x: number; y: number } = { x: 0.5, y: 0.4 }, count = 120): void {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'vip-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  if (!context) { canvas.remove(); return; }
  const colours = ['#ffd23f', '#ffc53d', '#e0393e', '#2f8fd8', '#2ee6ff', '#f4f4f0'];
  const pieces = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: origin.x * canvas.width, y: origin.y * canvas.height,
      vx: Math.cos(angle) * speed * ratio, vy: (Math.sin(angle) * speed - 6) * ratio,
      size: (4 + Math.random() * 6) * ratio, spin: Math.random() * 6, turn: (Math.random() - 0.5) * 0.4,
      colour: colours[Math.floor(Math.random() * colours.length)],
    };
  });
  const started = performance.now();
  const step = (now: number) => {
    const elapsed = now - started;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const piece of pieces) {
      piece.vy += 0.35 * ratio;
      piece.vx *= 0.99;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.spin += piece.turn;
      context.save();
      context.globalAlpha = Math.max(0, 1 - elapsed / 2400);
      context.translate(piece.x, piece.y);
      context.rotate(piece.spin);
      context.fillStyle = piece.colour;
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      context.restore();
    }
    if (elapsed < 2400) requestAnimationFrame(step); else canvas.remove();
  };
  requestAnimationFrame(step);
}

let audio: AudioContext | null = null;
/** The thud of an arrow hitting the boss. */
export function thunk(): void {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    const now = audio.currentTime;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(180, now);
    tone.frequency.exponentialRampToValueAtTime(60, now + 0.12);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    tone.connect(gain).connect(audio.destination);
    tone.start(now);
    tone.stop(now + 0.2);
  } catch { /* sound is optional */ }
}

export const CELEBRATE_KEY = 'archerlab-edge:vip-celebrate';
export function celebrationsOn(): boolean {
  try { return localStorage.getItem(CELEBRATE_KEY) !== '0'; } catch { return true; }
}
