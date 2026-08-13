import type { ShotCaptureDebug } from '../../types/shotAnalysis';

export function ShotCaptureDebugPanel({ debug }: { debug: ShotCaptureDebug }) {
  return <details className="biomechanics-debug"><summary>Shot capture diagnostics</summary><dl>
    <div><dt>State</dt><dd>{debug.captureState}</dd></div>
    <div><dt>Buffer</dt><dd>{debug.bufferFrames} / {(debug.bufferDurationMs / 1000).toFixed(2)} s</dd></div>
    <div><dt>Latest / release</dt><dd>{Math.round(debug.latestTimestampMs)} / {debug.releaseTimestampMs === null ? '--' : Math.round(debug.releaseTimestampMs)} ms</dd></div>
    <div><dt>Relative time / phase</dt><dd>{debug.relativeTimestampMs === null ? '--' : `${Math.round(debug.relativeTimestampMs)} ms`} / {debug.currentPhase ?? '--'}</dd></div>
    <div><dt>Auto candidate</dt><dd>{debug.candidateEnabled ? 'enabled' : 'off'} · {debug.candidateStrength.toFixed(2)} / {debug.candidateThreshold}</dd></div>
    <div><dt>Draw wrist velocity</dt><dd>{debug.drawWristVelocity.toFixed(2)} SW/s</dd></div>
    <div><dt>Draw elbow velocity</dt><dd>{debug.drawElbowVelocity.toFixed(2)} SW/s</dd></div>
    <div><dt>Bow wrist velocity</dt><dd>{debug.bowWristVelocity.toFixed(2)} SW/s</dd></div>
    <div><dt>Pre / post usable</dt><dd>{debug.preReleaseUsableSamples} / {debug.postReleaseUsableSamples}</dd></div>
  </dl></details>;
}
