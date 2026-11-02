import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { arrowLabel, scorePoint } from '../../scoring/scoring';
import { BEST_KEY, LEVELS, dailySeed, impact, rng, roundBonus, windFor, wobble, type Level, type Vec } from '../../vip/game';
import { confetti, thunk } from '../../vip/confetti';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const RINGS = ['#f4f4f0', '#f4f4f0', '#1d1d1f', '#1d1d1f', '#2f8fd8', '#2f8fd8', '#e0393e', '#e0393e', '#ffd23f', '#ffd23f'];
const VIEW = 1.25;
type Mode = Level | 'daily';
const DAILY_LEVEL: Level = 'outdoor';

function readBest(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
}

/** The target face never changes, so it is drawn once and never re-rendered. */
const Face = memo(function Face() {
  return (
    <>
      <circle cx={0} cy={0} r={VIEW} fill="#3f6b3a" />
      {RINGS.map((colour, index) => <circle key={index} cx={0} cy={0} r={1 - index / 10} fill={colour} stroke={index === 2 || index === 3 ? '#f4f4f0' : '#1d1d1f'} strokeWidth={0.005} />)}
      <circle cx={0} cy={0} r={0.05} fill="none" stroke="#1d1d1f" strokeWidth={0.004} />
    </>
  );
});

const tone = (hit: { score: number; isX: boolean }) => (hit.isX || hit.score >= 9 ? 'gold' : hit.score >= 7 ? 'red' : hit.score >= 5 ? 'blue' : hit.score >= 3 ? 'black' : 'white');

/**
 * Aim through the sight, hold steady, read the wind, release. The pin moves
 * every frame, so it is moved directly (no React re-render per frame), which
 * keeps the game smooth on slower phones.
 */
export function WindChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<Mode>('outdoor');
  const level: Level = mode === 'daily' ? DAILY_LEVEL : mode;
  const random = useRef(rng(Math.floor(Math.random() * 1e9)));
  const [wind, setWind] = useState(() => windFor('outdoor', random.current));
  const [drawing, setDrawing] = useState(false);
  const [hits, setHits] = useState<Array<Vec & { score: number; isX: boolean }>>([]);
  const [best, setBest] = useState(readBest);
  const aim = useRef<Vec>({ x: 0, y: 0 });
  const holdStart = useRef<number | null>(null);
  const phase = useRef(Math.random() * 10);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pinRef = useRef<SVGGElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const config = LEVELS[level];
  const done = hits.length >= config.arrows;
  const total = hits.reduce((sum, hit) => sum + hit.score, 0);
  const bonus = done ? roundBonus(hits) : 0;
  const bestKey = mode === 'daily' ? `daily:${today}` : mode;

  const placePin = (drift: Vec = { x: 0, y: 0 }) => {
    pinRef.current?.setAttribute('transform', `translate(${(aim.current.x + drift.x).toFixed(4)} ${(aim.current.y + drift.y).toFixed(4)})`);
  };

  useEffect(() => {
    if (!drawing) return;
    let frame = 0;
    const tick = () => {
      if (holdStart.current !== null) {
        const held = (performance.now() - holdStart.current) / 1000;
        placePin(wobble(held, phase.current));
        if (labelRef.current) labelRef.current.textContent = `Holding ${held.toFixed(1)} s… let go to shoot`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drawing]);

  const reset = (next: Mode = mode) => {
    setMode(next);
    setHits([]);
    aim.current = { x: 0, y: 0 };
    placePin();
    // The daily challenge gives everyone the same wind and the same luck today, so scores can be compared.
    random.current = rng(next === 'daily' ? dailySeed(today) : Math.floor(Math.random() * 1e9));
    setWind(windFor(next === 'daily' ? DAILY_LEVEL : next, random.current));
  };

  const startDraw = () => {
    if (done || holdStart.current !== null) return;
    phase.current = mode === 'daily' ? hits.length * 1.7 : Math.random() * 10;
    holdStart.current = performance.now();
    setDrawing(true);
  };

  const release = () => {
    if (holdStart.current === null) return;
    const held = (performance.now() - holdStart.current) / 1000;
    holdStart.current = null;
    setDrawing(false);
    const point = impact(aim.current, held, wind.push, level, random.current, phase.current);
    placePin();
    const scored = scorePoint(point.x, point.y, 'full');
    const next = [...hits, { ...point, ...scored }];
    setHits(next);
    thunk();
    if (scored.isX) confetti({ x: 0.5, y: 0.45 }, 50);
    if (next.length >= config.arrows) {
      const final = next.reduce((sum, hit) => sum + hit.score, 0) + roundBonus(next);
      if (final > (best[bestKey] ?? 0)) {
        const updated = { ...best, [bestKey]: final };
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
    const scale = (VIEW * 2) / svgRef.current.clientWidth;
    aim.current = {
      x: Math.max(-1.1, Math.min(1.1, aim.current.x + (event.clientX - drag.current.x) * scale)),
      y: Math.max(-1.1, Math.min(1.1, aim.current.y + (event.clientY - drag.current.y) * scale)),
    };
    drag.current = { x: event.clientX, y: event.clientY };
    if (holdStart.current === null) placePin();
  };
  const up = () => { drag.current = null; };

  const keys = (event: KeyboardEvent) => {
    const step = 0.03;
    const moves: Record<string, Vec> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (moves[event.key]) {
      aim.current = { x: aim.current.x + moves[event.key].x, y: aim.current.y + moves[event.key].y };
      if (holdStart.current === null) placePin();
    } else if (event.key === ' ' && !event.repeat) startDraw();
    else return;
    event.preventDefault();
  };

  const windAngle = Math.atan2(wind.push.y, wind.push.x) * (180 / Math.PI);
  const modes: Array<{ key: Mode; label: string; note: string }> = [
    { key: 'daily', label: 'Daily challenge', note: `Same wind for everyone today · Best: ${best[`daily:${today}`] ?? '–'}` },
    ...(Object.keys(LEVELS) as Level[]).map((key) => ({ key, label: LEVELS[key].label, note: `Best: ${best[key] ?? '–'}` })),
  ];

  return (
    <section className="va-panel vip-game" aria-labelledby="vip-game-title">
      <h2 id="vip-game-title"><AppIcon name="target" size={18} /> Wind Challenge</h2>
      <p className="va-muted">Drag to aim, then <strong>hold</strong> the draw button and <strong>let go</strong> to shoot. Hold too long and the pin starts to wobble; aim off to beat the wind. {config.arrows} arrows, plus a bonus for a tight group.</p>
      <div className="scoring-rounds" role="radiogroup" aria-label="Level">
        {modes.map((item) => (
          <button key={item.key} type="button" role="radio" aria-checked={mode === item.key} className={`scoring-round${mode === item.key ? ' is-selected' : ''}`} onClick={() => reset(item.key)}>
            <strong>{item.key === 'daily' ? <><AppIcon name="calendar" size={14} /> {item.label}</> : item.label}</strong><small>{item.note}</small>
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
          <Face />
          {hits.map((hit, index) => <circle key={index} cx={hit.x} cy={hit.y} r={0.026} className="vip-game__hit" />)}
          <g ref={pinRef} className={`vip-game__pin${drawing ? ' is-drawing' : ''}`} transform="translate(0 0)">
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
          <div className="vip-game__arrows">{hits.map((hit, index) => <span key={index} className={`scoresheet__arrow scoresheet__arrow--${tone(hit)}`}>{arrowLabel({ x: hit.x, y: hit.y, score: hit.score, isX: hit.isX })}</span>)}</div>
          {done ? (
            <div className="vip-game__done" role="status">
              <strong>{total + bonus} points{total + bonus >= (best[bestKey] ?? 0) ? ' · New best!' : ''}</strong>
              {mode === 'daily' ? <small className="va-faint">Everyone gets the same wind today: compare with your friends. A new challenge comes tomorrow.</small> : null}
              <ActionButton variant="primary" type="button" onClick={() => reset()}><AppIcon name="refresh" size={16} /> Play again</ActionButton>
            </div>
          ) : (
            <button
              type="button"
              className={`vip-game__draw${drawing ? ' is-drawing' : ''}`}
              onPointerDown={(event) => { event.preventDefault(); startDraw(); }}
              onPointerUp={release}
              onPointerLeave={release}
              onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startDraw(); } }}
              onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release(); } }}
            >
              {drawing ? <span key="holding" ref={labelRef}>Holding…</span> : <span key="idle">Hold to draw</span>}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
