import { useMemo } from 'react';
import { goalProgress } from '../../practice-log/aggregate';
import type { PracticeEntry, PracticeGoals } from '../../practice-log/types';
import { AppIcon } from '../AppIcon';

function Bar({ label, value, target, fraction }: { label: string; value: number; target: number; fraction: number }) {
  return (
    <div className="goal-progress__item">
      <div><span>{label}</span><strong>{value}<small> / {target}</small></strong></div>
      <div className="goal-progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)}>
        <span className={fraction >= 1 ? 'is-done' : ''} style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
    </div>
  );
}

/** This week's progress against the athlete's goals (Training, Home and Profile). */
export function GoalProgressCard({ entries, goals, onEdit, onOpen, compact = false }: { entries: readonly PracticeEntry[]; goals: PracticeGoals; onEdit?: () => void; onOpen?: () => void; compact?: boolean }) {
  const progress = useMemo(() => goalProgress(entries, goals), [entries, goals]);
  const hasGoals = goals.weeklyArrows || goals.weeklySessions || goals.focus;
  if (!hasGoals && compact) return null;
  return (
    <section className={`va-panel goal-progress${compact ? ' goal-progress--compact' : ''}`} aria-labelledby="goal-progress-title">
      <h2 id="goal-progress-title"><AppIcon name="target" size={20} /> This week’s goals</h2>
      {hasGoals ? (
        <>
          {goals.weeklyArrows && progress.arrowsFraction !== null ? <Bar label="Arrows" value={progress.arrows} target={goals.weeklyArrows} fraction={progress.arrowsFraction} /> : null}
          {goals.weeklySessions && progress.sessionsFraction !== null ? <Bar label="Sessions" value={progress.sessions} target={goals.weeklySessions} fraction={progress.sessionsFraction} /> : null}
          {goals.focus ? <p className="goal-progress__focus"><span>Focus area</span><strong>{goals.focus.title}</strong></p> : null}
        </>
      ) : <p className="va-muted">Set a weekly target for arrows or sessions, and a focus area from your latest video analysis.</p>}
      {onEdit || onOpen ? (
        <div className="va-actions">
          {onOpen ? <button type="button" className="button button--secondary" onClick={onOpen}><AppIcon name="calendar" size={15} /> Open training log</button> : null}
          {onEdit ? <button type="button" className="button button--ghost" onClick={onEdit}>{hasGoals ? 'Change goals' : 'Set goals'}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
