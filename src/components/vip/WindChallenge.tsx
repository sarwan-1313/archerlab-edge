import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { arrowLabel, scorePoint } from '../../scoring/scoring';
import { BEST_KEY, LEVELS, impact, rng, roundBonus, windFor, wobble, type Level, type Vec } from '../../vip/game';
import { confetti, thunk } from '../../vip/confetti';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const RINGS = ['#f4f4f0', '#f4f4f0', '#1d1d1f', '#1d1d1f', '#2f8fd8', '#2f8fd8', '#e0393e', '#e0393e', '#ffd23f', '#ffd23f'];
const VIEW = 1.25;

function readBest(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
}

/** Aim through the sight, hold steady, read the wind, release. */
export function WindChallenge() {
  const [level, setLevel] = useState<Level>('outdoor');
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const random = useRef(rng(seed));
  const [wind, setWind] = useState(() => windFor('outdoor', random.current));
  const [aim, setAim] = useState<Vec>({ x: 0, y: 0 });
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [hits, setHits] = useState<Array<Vec & { score: number; isX: boolean }>>([]);
  const [best, setBest] = useState(readBest);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const phase = useRef(Math.random() * 10);
  const config = LEVELS[level];
  const done = hits.length >= config.arrows;
  const total = hits.reduce((sum, hit) => sum + hit.score, 0);
  const bonus = done ? roundBonus(hits) : 0;

  useEffect(() => {
    if (holdStart === null) return;
    let frame = 0;
    const tick = () => { setNow(performance.now()); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [holdStart]);

  const holdS = holdStart === null ? 0 : (now - holdStart) / 1000;
  const drift = holdStart === null ? { x: 0, y: 0 } : wobble(holdS, phase.current);
  const pin = { x: aim.x + drift.x, y: aim.y + drift.y };

  const reset = (next: Level = level) => {
    setLevel(next);
    setHits([]);
    setAim({ x: 0, y: 0 });
    setWind(windFor(next, random.current));
  };

  const startDraw = () => { if (!done && holdStart === null) { phase.current = Math.random() * 10; setNow(performance.now()); setHoldStart(performance.now()); } };
  const release = () => {
    if (holdStart === null) return;
    const held = (performance.now() - holdStart) / 1000;
    setHoldStart(null);
    const point = impact(aim, held, wind.push, level, random.current, phase.current);
    const scored = scorePoint(point.x, point.y, 'full');
    const next = [...hits, { ...point, ...scored }];
    setHits(next);
    thunk();
    if (scored.isX) confetti({ x: 0.5, y: 0.45 }, 60);
    if (next.length >= config.arrows) {
      const final = next.reduce((sum, hit) => sum + hit.score, 0) + roundBonus(next);
      if (final > (best[level] ?? 0)) {
        const updated = { ...best, [level]: final };
        setBest(updated);
        try { localStorage.setItem(BEST_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
        confetti();
      }
    } else {
      setWind(windFor(level, random.current));
    }
  };

  // Aim by dragging anywhere on the scope (relative movement, so a finger never hides the pin).
  const down = (event: PointerEvent<SVGSVGElement>) => { event.currentTarget.setPointerCapture?.(event.pointerId); drag.current = { x: event.clientX, y: event.clientY }; };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current) return;
    const box = svgRef.current.getBoundingClientRect();
    const scale = (VIEW * 2) / box.width;
    const dx = (event.clientX - drag.current.x) * scale;
    const dy = (event.clientY - drag.current.y) * scale;
    drag.current = { x: event.clientX, y: event.clientY };
    setAim((current) => ({ x: Math.max(-1.1, Math.min(1.1, current.x + dx)), y: Math.max(-1.1, Math.min(1.1, current.y + dy)) }));
  };
  const up = () => { drag.current = null; };

  const keys = (event: KeyboardEvent) => {
    const step = 0.03;
    if (event.key === 'ArrowLeft') setAim((a) => ({ ...a, x: a.x - step }));
    else if (event.key === 'ArrowRight') setAim((a) => ({ ...a, x: a.x + step }));
    else if (event.key === 'ArrowUp') setAim((a) => ({ ...a, y: a.y - step }));
    else if (event.key === 'ArrowDown') setAim((a) => ({ ...a, y: a.y + step }));
    else if (event.key === ' ' && !event.repeat) startDraw();
    else return;
    event.preventDefault();
  };

  const windAngle = Math.atan2(wind.push.y, wind.push.x) * (180 / Math.PI);
  return (
    <section className="va-panel vip-game" aria-labelledby="vip-game-title">
      <h2 id="vip-game-title"><AppIcon name="target" size={18} /> Wind Challenge</h2>
      <p className="va-muted">Drag to aim, then <strong>hold</strong> the draw button and <strong>let go</strong> to shoot. Hold too long and the pin starts to wobble; aim off to beat the wind. {config.arrows} arrows, plus a bonus for a tight group.</p>
      <div className="scoring-rounds" role="radiogroup" aria-label="Level">
        {(Object.keys(LEVELS) as Level[]).map((key) => (
          <button key={key} type="button" role="radio" aria-checked={level === key} className={`scoring-round${level === key ? ' is-selected' : ''}`} onClick={() => reset(key)}>
            <strong>{LEVELS[key].label}</strong><small>Best: {best[key] ?? '–'}</small>
          </button>
        ))}
      </div>
      <div className="vip-game__stage">
        <svg
          ref={svgRef}
          viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
          className="vip-game__scope"
          role="application"
          aria-label="Target seen through the sight. Arrow keys aim, hold Space to draw and let go to shoot."
          tabIndex={0}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={keys}
          onKeyUp={(event) => { if (event.key === ' ') { event.preventDefault(); release(); } }}
        >
          <circle cx={0} cy={0} r={VIEW} fill="#3f6b3a" />
          {RINGS.map((colour, index) => <circle key={index} cx={0} cy={0} r={1 - index / 10} fill={colour} stroke={index === 2 || index === 3 ? '#f4f4f0' : '#1d1d1f'} strokeWidth={0.005} />)}
          <circle cx={0} cy={0} r={0.05} fill="none" stroke="#1d1d1f" strokeWidth={0.004} />
          {hits.map((hit, index) => <circle key={index} cx={hit.x} cy={hit.y} r={0.026} className="vip-game__hit" />)}
          <g className={`vip-game__pin${holdStart !== null ? ' is-drawing' : ''}`} transform={`translate(${pin.x} ${pin.y})`}>
            <circle r={0.07} fill="none" strokeWidth={0.012} />
            <circle r={0.012} />
            <path d="M -0.16 0 H -0.09 M 0.09 0 H 0.16 M 0 -0.16 V -0.09 M 0 0.09 V 0.16" strokeWidth={0.01} />
          </g>
          <circle cx={0} cy={0} r={VIEW - 0.01} fill="none" stroke="#04060a" strokeWidth={0.16} />
        </svg>
        <div className="vip-game__side">
          <div className="vip-game__wind" aria-live="polite">
            <span>Wind</span>
            {wind.kmh ? <strong><span className="vip-game__flag" style={{ transform: `rotate(${windAngle}deg)` }} aria-hidden="true">➜</span> {wind.kmh} km/h</strong> : <strong>Calm</strong>}
          </div>
          <div className="vip-game__score"><span>Score</span><strong>{total}{done && bonus ? <small> +{bonus} group</small> : null}</strong><small>Arrow {Math.min(hits.length + 1, config.arrows)} of {config.arrows}</small></div>
          <div className="vip-game__arrows">{hits.map((hit, index) => <span key={index} className={`scoresheet__arrow scoresheet__arrow--${hit.isX || hit.score >= 9 ? 'gold' : hit.score >= 7 ? 'red' : hit.score >= 5 ? 'blue' : hit.score >= 3 ? 'black' : 'white'}`}>{arrowLabel({ x: hit.x, y: hit.y, score: hit.score, isX: hit.isX })}</span>)}</div>
          {done ? (
            <div className="vip-game__done" role="status">
              <strong>{total + bonus} points{total + bonus >= (best[level] ?? 0) ? ' · New best!' : ''}</strong>
              <ActionButton variant="primary" type="button" onClick={() => reset()}><AppIcon name="refresh" size={16} /> Play again</ActionButton>
            </div>
          ) : (
            <button
              type="button"
              className={`vip-game__draw${holdStart !== null ? ' is-drawing' : ''}`}
              onPointerDown={(event) => { event.preventDefault(); startDraw(); }}
              onPointerUp={release}
              onPointerLeave={release}
              onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startDraw(); } }}
              onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release(); } }}
            >
              {holdStart !== null ? `Holding ${holdS.toFixed(1)} s… let go to shoot` : 'Hold to draw'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
