import type { GestureDebugData } from '../../types/gestureScore';

export function GestureDebugPanel({ debug }: { debug: GestureDebugData }) {
  return <details className="biomechanics-debug"><summary>Gesture diagnostics</summary><dl>
    <div><dt>State / shot</dt><dd>{debug.state} / {debug.awaitingShotId ?? '--'}</dd></div>
    <div><dt>Hands detected</dt><dd>{debug.handsDetected}</dd></div>
    <div><dt>Hand confidence L / R</dt><dd>{debug.leftHandConfidence.toFixed(2)} / {debug.rightHandConfidence.toFixed(2)}</dd></div>
    <div><dt>Finger count L / R</dt><dd>{debug.leftFingerCount ?? '--'} / {debug.rightFingerCount ?? '--'}</dd></div>
    <div><dt>Wrists crossed</dt><dd>{debug.wristsCrossed ? 'yes' : 'no'}</dd></div>
    <div><dt>Candidate</dt><dd>{debug.candidateScore} / {debug.candidateConfidence.toFixed(2)}</dd></div>
    <div><dt>Stable / required</dt><dd>{Math.round(debug.stableDurationMs)} / {debug.requiredHoldMs} ms</dd></div>
  </dl></details>;
}
