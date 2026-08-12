import { AppIcon } from './AppIcon';

export type CalibrationStepState = 'complete' | 'active' | 'pending';

type CalibrationStepProps = {
  index: number;
  title: string;
  detail?: string;
  state: CalibrationStepState;
};

export function CalibrationStep({ index, title, detail, state }: CalibrationStepProps) {
  return (
    <li className={`calibration-step calibration-step--${state}`} aria-current={state === 'active' ? 'step' : undefined}>
      <div className="calibration-step__marker" aria-hidden="true">
        {state === 'complete' ? <AppIcon name="check" size={16} /> : <span>{index}</span>}
      </div>
      <div className="calibration-step__copy">
        <span className="calibration-step__title">{title}</span>
        {detail ? <span className="calibration-step__detail">{detail}</span> : null}
      </div>
      <span className="calibration-step__state">
        {state === 'complete' ? 'Complete' : state === 'active' ? 'Current' : 'Pending'}
      </span>
    </li>
  );
}
