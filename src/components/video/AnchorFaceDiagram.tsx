import { contactDistance } from '../../video-analysis/anchor';
import type { ShotReport } from '../../video-analysis/types';
import { StatusBadge } from '../StatusBadge';

// The diagram uses the measurement frame (see video-analysis/anchor.ts): the chin at (0, 0), the forehead one
// face height up, the draw-hand side to the right. SVG y grows downwards, so y is flipped.
const VIEW = { left: -0.75, right: 0.95, bottom: -0.55, top: 1.1 };
const SCALE = 200;
const sx = (x: number) => (x - VIEW.left) * SCALE;
const sy = (y: number) => (VIEW.top - y) * SCALE;
const WIDTH = (VIEW.right - VIEW.left) * SCALE;
const HEIGHT = (VIEW.top - VIEW.bottom) * SCALE;

/** Low-confidence points are hollow: side-on footage often hides the draw side of the face. */
const SOLID_FROM = 0.4;

export function AnchorFaceDiagram({ shots }: { shots: readonly ShotReport[] }) {
  const placed = shots.filter((shot): shot is ShotReport & { anchorFace: NonNullable<ShotReport['anchorFace']> } => Boolean(shot.anchorFace));
  if (!placed.length) return null;
  const confident = placed.filter((shot) => shot.anchorFace.confidence >= SOLID_FROM).length;
  return (
    <section className="va-panel va-anchor-face" aria-labelledby="va-anchor-face-title">
      <h2 id="va-anchor-face-title">Anchor on the face <StatusBadge label="Experimental" tone="info" compact /></h2>
      <p className="va-muted">Where your index fingertip sat at anchor, one dot per shot. Measured from the face and hand models on a few frames of each anchor, relative to your chin and face size. Hollow dots: the draw side of the face was not seen well, so treat them as rough.</p>
      <div className="va-anchor-face__body">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Face diagram with ${placed.length} anchor point${placed.length === 1 ? '' : 's'}`}>
          <ellipse cx={sx(0)} cy={sy(0.52)} rx={0.42 * SCALE} ry={0.6 * SCALE} className="va-anchor-face__outline" />
          <ellipse cx={sx(-0.17)} cy={sy(0.66)} rx={0.07 * SCALE} ry={0.03 * SCALE} className="va-anchor-face__feature" />
          <ellipse cx={sx(0.17)} cy={sy(0.66)} rx={0.07 * SCALE} ry={0.03 * SCALE} className="va-anchor-face__feature" />
          <path d={`M ${sx(0)} ${sy(0.62)} L ${sx(-0.05)} ${sy(0.45)} L ${sx(0.05)} ${sy(0.45)}`} className="va-anchor-face__feature" />
          <path d={`M ${sx(-0.18)} ${sy(0.28)} Q ${sx(0)} ${sy(0.22)} ${sx(0.18)} ${sy(0.28)}`} className="va-anchor-face__feature" />
          <text x={sx(0.62)} y={sy(1.02)} className="va-anchor-face__label" textAnchor="middle">draw side →</text>
          {placed.map((shot) => {
            const { x, y, confidence } = shot.anchorFace;
            const solid = confidence >= SOLID_FROM;
            return (
              <g key={shot.index}>
                <title>{`Shot ${shot.index}: ${Math.round(contactDistance(shot.anchorFace) * 100)}% of a face height from chin or mouth corner · confidence ${Math.round(confidence * 100)}%`}</title>
                <circle cx={sx(x)} cy={sy(y)} r={11} className={solid ? 'va-anchor-face__dot' : 'va-anchor-face__dot va-anchor-face__dot--rough'} />
                <text x={sx(x)} y={sy(y) + 4} textAnchor="middle" className="va-anchor-face__num">{shot.index}</text>
              </g>
            );
          })}
        </svg>
        <p className="va-faint">{confident} of {placed.length} shot{placed.length === 1 ? '' : 's'} with the face seen well. Shots where the face or hand was not found are left out.</p>
      </div>
    </section>
  );
}
