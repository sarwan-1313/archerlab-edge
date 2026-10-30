import { CATEGORY_INFO } from '../../video-analysis/rubric';
import { LEVEL_LABEL } from '../../video-analysis/scoring';
import { formatDate } from '../../video-analysis/format';
import { LEVEL_TO_EXPERIENCE, isFormStatus } from '../../video-analysis/profileStatus';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { LevelBadge } from '../video/LevelBadge';

type FormStatusCardProps = {
  formStatus: unknown;
  experienceLevel: string;
  onAdoptLevel: (experienceLevel: string) => void;
  onAnalyze?: () => void;
};

function Trend({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points, 40);
  const max = Math.max(...points, 90);
  const x = (index: number) => (index / (points.length - 1)) * 100;
  const y = (value: number) => 30 - ((value - min) / Math.max(1, max - min)) * 26 - 2;
  return (
    <figure className="form-status__trend" style={{ margin: 0 }}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`Form score trend over ${points.length} analyses, latest ${points.at(-1)}`}>
        <polyline points={points.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
        <circle cx={x(points.length - 1)} cy={y(points.at(-1) as number)} r="1.6" />
      </svg>
      <figcaption className="va-faint">Form score across your last {points.length} video analyses</figcaption>
    </figure>
  );
}

/** The athlete's form status, written by the video engine after each analysis. */
export function FormStatusCard({ formStatus, experienceLevel, onAdoptLevel, onAnalyze }: FormStatusCardProps) {
  if (!isFormStatus(formStatus)) {
    return (
      <section className="va-panel" aria-labelledby="form-status-title" style={{ marginBottom: 20 }}>
        <h2 id="form-status-title">Form status</h2>
        <p className="va-muted">Analyse a video of a few shots and ArcherLab will estimate your form level, track it over time and keep your focus areas here.</p>
        {onAnalyze ? <ActionButton variant="secondary" type="button" onClick={onAnalyze}><AppIcon name="film" size={16} /> Analyse a video</ActionButton> : null}
      </section>
    );
  }
  const scores = formStatus.history.map((entry) => entry.score).filter((score): score is number => typeof score === 'number');
  const suggested = formStatus.estimatedLevel ? LEVEL_TO_EXPERIENCE[formStatus.estimatedLevel] : null;
  return (
    <section className="form-status" aria-labelledby="form-status-title">
      <div className="form-status__level">
        <span className="va-eyebrow" id="form-status-title">Form status · ArcherLab estimate</span>
        <strong>{formStatus.score ?? '–'}</strong>
        <LevelBadge level={formStatus.estimatedLevel} />
        <small>{formStatus.confidence} confidence · updated {formatDate(formStatus.updatedAt)}</small>
      </div>
      <div className="va-panel form-status__body">
        <Trend points={scores.slice(-20)} />
        {formStatus.nextLevel ? (
          <p className="va-muted">
            <strong>Next: {LEVEL_LABEL[formStatus.nextLevel.level]} at {formStatus.nextLevel.threshold}.</strong>{' '}
            Focus on {formStatus.nextLevel.focus.map((id) => CATEGORY_INFO[id].label.toLowerCase()).join(' and ')}.
          </p>
        ) : null}
        {formStatus.focus.length ? <div><span className="va-eyebrow">Current focus</span><ul>{formStatus.focus.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        <div className="va-actions">
          {suggested && suggested !== experienceLevel ? (
            <ActionButton variant="secondary" type="button" onClick={() => onAdoptLevel(suggested)}>Use “{LEVEL_LABEL[formStatus.estimatedLevel!]}” as my experience level</ActionButton>
          ) : null}
          {onAnalyze ? <ActionButton variant="ghost" type="button" onClick={onAnalyze}><AppIcon name="film" size={16} /> Analyse another video</ActionButton> : null}
        </div>
      </div>
    </section>
  );
}
