/**
 * Scroll-driven landing animation: a bow is drawn, the arrow is released,
 * flies, and lands in the bullseye. Pure DOM so it stays framework-free and
 * cheap: one rAF-throttled scroll listener that writes SVG attributes.
 */

const VIEW = { stringX: 112, top: 62, bottom: 338, midY: 200, drawDepth: 92, arrowLength: 236, targetX: 860 } as const;

// Scroll progress (0-1) at which each phase begins and ends.
const PHASES = {
  draw: [0.06, 0.34],
  hold: [0.34, 0.46],
  release: [0.46, 0.5],
  flight: [0.46, 0.78],
  impact: [0.78, 0.86],
} as const;

export type ScenePhase = 'ready' | 'draw' | 'hold' | 'release' | 'impact';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const span = (p: number, [start, end]: readonly [number, number]) => clamp((p - start) / (end - start));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function phaseAt(p: number): ScenePhase {
  if (p < PHASES.draw[0]) return 'ready';
  if (p < PHASES.hold[0]) return 'draw';
  if (p < PHASES.release[0]) return 'hold';
  if (p < PHASES.impact[0]) return 'release';
  return 'impact';
}

/** Geometry for a given progress value; exported for tests. */
export function sceneFrame(p: number) {
  const draw = easeInOut(span(p, PHASES.draw)) * (1 - span(p, PHASES.release));
  const releaseT = span(p, PHASES.release);
  const flightT = span(p, PHASES.flight);
  const impactT = span(p, PHASES.impact);
  const settled = p >= PHASES.impact[0];

  // String: pulled back while drawing, then a decaying vibration after release.
  const vibration = releaseT > 0 && flightT < 1 ? Math.sin(flightT * Math.PI * 7) * 10 * (1 - flightT) : 0;
  const stringMidX = VIEW.stringX - VIEW.drawDepth * draw + vibration;

  // Arrow: rides the string, then flies on a shallow arc to the target centre.
  const anchoredNock = VIEW.stringX - VIEW.drawDepth * draw;
  const releasedNock = VIEW.stringX - VIEW.drawDepth; // nock position at full draw
  const finalNock = VIEW.targetX - VIEW.arrowLength + 14; // tip sinks 14px into the face
  let nockX = anchoredNock;
  let arrowY = VIEW.midY;
  let angle = 0;
  if (flightT > 0) {
    const f = easeOut(flightT);
    nockX = releasedNock + (finalNock - releasedNock) * f;
    const arc = 34;
    arrowY = VIEW.midY - arc * Math.sin(Math.PI * f);
    const slope = (-arc * Math.PI * Math.cos(Math.PI * f)) / (finalNock - releasedNock);
    angle = (Math.atan(slope) * 180) / Math.PI;
  }

  return {
    draw,
    stringMidX,
    nockX,
    arrowY,
    angle: settled ? 0 : angle,
    flying: flightT > 0 && flightT < 1,
    trail: flightT > 0 && flightT < 1 ? clamp(Math.sin(Math.PI * flightT) * 1.2) : 0,
    impact: impactT,
    shake: settled && impactT < 1 ? Math.sin(impactT * Math.PI * 6) * 5 * (1 - impactT) : 0,
    score: settled ? clamp((p - PHASES.impact[0]) / 0.06) : 0,
  };
}

type SceneElements = {
  section: HTMLElement;
  string: SVGPolylineElement;
  arrow: SVGGElement;
  trail: SVGLineElement;
  target: SVGGElement;
  pulse: SVGCircleElement[];
  score: SVGGElement;
  meters: HTMLElement[];
};

function query(root: HTMLElement): SceneElements | null {
  const section = root.querySelector<HTMLElement>('[data-scene="track"]');
  const string = root.querySelector<SVGPolylineElement>('[data-scene="string"]');
  const arrow = root.querySelector<SVGGElement>('[data-scene="arrow"]');
  const trail = root.querySelector<SVGLineElement>('[data-scene="trail"]');
  const target = root.querySelector<SVGGElement>('[data-scene="target"]');
  const score = root.querySelector<SVGGElement>('[data-scene="score"]');
  if (!section || !string || !arrow || !trail || !target || !score) return null;
  return {
    section,
    string,
    arrow,
    trail,
    target,
    score,
    pulse: Array.from(root.querySelectorAll<SVGCircleElement>('[data-scene="pulse"]')),
    meters: Array.from(root.querySelectorAll<HTMLElement>('[data-meter]')),
  };
}

function render(root: HTMLElement, el: SceneElements, p: number) {
  const f = sceneFrame(p);
  el.string.setAttribute('points', `${VIEW.stringX},${VIEW.top} ${f.stringMidX.toFixed(1)},${VIEW.midY} ${VIEW.stringX},${VIEW.bottom}`);
  el.arrow.setAttribute('transform', `translate(${f.nockX.toFixed(1)} ${f.arrowY.toFixed(1)}) rotate(${f.angle.toFixed(2)})`);
  el.trail.setAttribute('x1', String(Math.max(VIEW.stringX - VIEW.drawDepth, f.nockX - 220 * f.trail)));
  el.trail.setAttribute('x2', f.nockX.toFixed(1));
  el.trail.setAttribute('y1', f.arrowY.toFixed(1));
  el.trail.setAttribute('y2', f.arrowY.toFixed(1));
  el.trail.style.opacity = String(f.trail * 0.8);
  el.target.setAttribute('transform', `translate(${f.shake.toFixed(2)} 0)`);
  el.pulse.forEach((circle, index) => {
    const t = clamp(f.impact * 1.4 - index * 0.25);
    circle.setAttribute('r', String(26 + t * (110 + index * 30)));
    circle.style.opacity = t > 0 && t < 1 ? String((1 - t) * 0.9) : '0';
  });
  el.score.style.opacity = String(f.score);
  el.score.setAttribute('transform', `translate(0 ${(8 * (1 - f.score)).toFixed(1)})`);

  // Illustrative HUD readouts that move with the shot.
  const values: Record<string, string> = {
    draw: `${Math.round(easeInOut(span(p, PHASES.draw)) * 100)}%`,
    hold: p < PHASES.hold[0] ? '--' : `${(0.4 + 0.5 * (1 - span(p, PHASES.hold))).toFixed(1)}°`,
    release: p < PHASES.release[0] ? '--' : '1.8°',
    score: p < PHASES.impact[0] ? '--' : '10',
  };
  el.meters.forEach((meter) => {
    const key = meter.dataset.meter ?? '';
    if (key in values && meter.textContent !== values[key]) meter.textContent = values[key];
  });

  const phase = phaseAt(p);
  if (root.dataset.phase !== phase) root.dataset.phase = phase;
  root.style.setProperty('--scene-progress', p.toFixed(4));
}

function revealOnScroll(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (typeof IntersectionObserver === 'undefined') {
    items.forEach((item) => item.classList.add('is-visible'));
    return () => undefined;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
  items.forEach((item) => observer.observe(item));
  return () => observer.disconnect();
}

export function mountScrollScene(root: HTMLElement): () => void {
  const elements = query(root);
  const stopReveal = revealOnScroll(root);
  if (!elements) return stopReveal;

  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    root.dataset.motion = 'reduced';
    render(root, elements, 1);
    return stopReveal;
  }

  let frame = 0;
  const update = () => {
    frame = 0;
    const rect = elements.section.getBoundingClientRect();
    const travel = rect.height - window.innerHeight;
    const p = travel > 0 ? clamp(-rect.top / travel) : 0;
    render(root, elements, p);
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    stopReveal();
  };
}
