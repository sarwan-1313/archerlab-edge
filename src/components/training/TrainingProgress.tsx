import { AppIcon } from '../AppIcon';

const steps = ['Camera', 'Readiness', 'Start'] as const;

export function TrainingProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="training-progress" aria-label={`Setup step ${current} of ${steps.length}`}>
      {steps.map((label, index) => {
        const number = index + 1;
        const complete = number < current;
        const active = number === current;
        return (
          <li key={label} className={`${complete ? 'is-complete' : ''} ${active ? 'is-active' : ''}`} aria-current={active ? 'step' : undefined}>
            <span>{complete ? <AppIcon name="check" size={13} /> : number}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
