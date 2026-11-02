import { useRef, useState, type PointerEvent } from 'react';
import type { FaceKind } from '../../scoring/rounds';
import { arrowLabel, scorePoint } from '../../scoring/scoring';
import type { FaceMarker } from '../../scoring/markers';

/** Ring colours from the outside in (World Archery: white, black, blue, red, gold). */
const FULL_RINGS = ['#f4f4f0', '#f4f4f0', '#1d1d1f', '#1d1d1f', '#2f8fd8', '#2f8fd8', '#e0393e', '#e0393e', '#ffd23f', '#ffd23f'];
const SPOT_RINGS = ['#2f8fd8', '#e0393e', '#e0393e', '#ffd23f', '#ffd23f'];
const VIEW = 1.08;
/** On touch, the arrow is drawn this far above the finger so it stays visible while placing it. */
const TOUCH_LIFT = 0.14;

function ringLine(index: number, kind: FaceKind): string {
  const colour = kind === 'full' ? FULL_RINGS[index] : SPOT_RINGS[index];
  return colour === '#1d1d1f' ? '#f4f4f0' : '#1d1d1f';
}


interface TargetFaceProps {
  kind: FaceKind;
  markers?: readonly FaceMarker[];
  /** Group centre and mean spread to draw, in face units. */
  group?: { x: number; y: number; spread: number } | null;
  /** When set, tapping the face places an arrow. */
  onPlace?: (x: number, y: number) => void;
  label: string;
  size?: number;
}

/** A target face that arrows can be placed on with a tap (and adjusted by dragging before lifting the finger). */
export function TargetFaceInput({ kind, markers = [], group, onPlace, label, size = 340 }: TargetFaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const rings = kind === 'full' ? 10 : 5;

  const toFace = (event: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !box.width) return null;
    const lift = event.pointerType === 'touch' ? TOUCH_LIFT : 0;
    return {
      x: ((event.clientX - box.left) / box.width) * 2 * VIEW - VIEW,
      y: ((event.clientY - box.top) / box.height) * 2 * VIEW - VIEW - lift,
    };
  };

  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (!onPlace) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPending(toFace(event));
  };
  const move = (event: PointerEvent<SVGSVGElement>) => { if (pending) setPending(toFace(event)); };
  const up = (event: PointerEvent<SVGSVGElement>) => {
    if (!pending || !onPlace) return;
    const point = toFace(event) ?? pending;
    setPending(null);
    onPlace(Math.max(-VIEW, Math.min(VIEW, point.x)), Math.max(-VIEW, Math.min(VIEW, point.y)));
  };

  const preview = pending ? scorePoint(pending.x, pending.y, kind) : null;

  return (
    <figure className={`target-face${onPlace ? ' target-face--input' : ''}`} style={{ maxWidth: size }}>
      <svg
        ref={svgRef}
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        role="img"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setPending(null)}
      >
        {Array.from({ length: rings }, (_, index) => {
          const radius = 1 - index / rings;
          const colour = kind === 'full' ? FULL_RINGS[index] : SPOT_RINGS[index];
          return <circle key={index} cx={0} cy={0} r={radius} fill={colour} stroke={ringLine(index, kind)} strokeWidth={0.006} />;
        })}
        <circle cx={0} cy={0} r={kind === 'full' ? 0.05 : 0.1} fill="none" stroke="#1d1d1f" strokeWidth={0.004} />
        <line x1={-0.015} y1={0} x2={0.015} y2={0} stroke="#1d1d1f" strokeWidth={0.004} />
        <line x1={0} y1={-0.015} x2={0} y2={0.015} stroke="#1d1d1f" strokeWidth={0.004} />
        {group ? (
          <g className="target-face__group">
            <circle cx={group.x} cy={group.y} r={Math.max(group.spread, 0.02)} fill="rgba(46,230,255,.12)" stroke="#2ee6ff" strokeWidth={0.008} strokeDasharray="0.03 0.02" />
            <path d={`M ${group.x - 0.035} ${group.y} H ${group.x + 0.035} M ${group.x} ${group.y - 0.035} V ${group.y + 0.035}`} stroke="#2ee6ff" strokeWidth={0.01} />
          </g>
        ) : null}
        {markers.map((marker, index) => (
          <g key={index} className={`target-face__arrow target-face__arrow--${marker.tone ?? 'current'}`}>
            <circle cx={marker.x} cy={marker.y} r={0.028} />
            {marker.label ? <text x={marker.x} y={marker.y + 0.012} textAnchor="middle" fontSize={0.034}>{marker.label}</text> : null}
          </g>
        ))}
        {pending ? (
          <g className="target-face__pending">
            <circle cx={pending.x} cy={pending.y} r={0.032} />
            <text x={pending.x} y={pending.y - 0.06} textAnchor="middle" fontSize={0.07}>{preview ? arrowLabel({ x: pending.x, y: pending.y, ...preview }) : ''}</text>
          </g>
        ) : null}
      </svg>
    </figure>
  );
}
