import type { BiomechanicsSnapshot } from '../../types/biomechanics';

function value(number: number | null | undefined, digits = 2) { return number === null || number === undefined || !Number.isFinite(number) ? '--' : number.toFixed(digits); }

export function BiomechanicsDebugPanel({ snapshot }: { snapshot: BiomechanicsSnapshot }) {
  const debug = snapshot.debug;
  return (
    <details className="biomechanics-debug">
      <summary>Biomechanics diagnostics</summary>
      <dl>
        <div><dt>Handedness / bow side</dt><dd>{debug.handedness} / {debug.bowSide}</dd></div>
        <div><dt>Samples / window</dt><dd>{debug.historySamples} / {(debug.historyDurationMs / 1000).toFixed(2)} s</dd></div>
        <div><dt>Shoulder width</dt><dd>{value(debug.shoulderWidth, 3)}</dd></div>
        <div><dt>Metric confidence</dt><dd>{Math.round(debug.metricConfidence * 100)}%</dd></div>
        <div><dt>Shoulder raw / smoothed</dt><dd>{value(snapshot.shoulderLineAngle.rawValue)}° / {value(snapshot.shoulderLineAngle.smoothedValue)}°</dd></div>
        <div><dt>Elbow raw / smoothed</dt><dd>{value(snapshot.bowArmElbowAngle.rawValue)}° / {value(snapshot.bowArmElbowAngle.smoothedValue)}°</dd></div>
        <div><dt>Torso raw / smoothed</dt><dd>{value(snapshot.torsoLean.rawValue)}° / {value(snapshot.torsoLean.smoothedValue)}°</dd></div>
        <div><dt>Head RMS</dt><dd>{value(debug.headRmsPercent)}% SW</dd></div>
        <div><dt>Bow-hand RMS</dt><dd>{value(debug.bowHandRmsPercent)}% SW</dd></div>
        <div><dt>Bow-hand path</dt><dd>{value(snapshot.bowHandMotion.pathLengthShoulderWidths)} SW</dd></div>
        <div><dt>Bow-hand velocity</dt><dd>{value(snapshot.bowHandMotion.velocityShoulderWidthsPerSecond)} SW/s</dd></div>
        <div><dt>Shoulder mean / range</dt><dd>{value(snapshot.shoulderVariation.mean)}° / {value(snapshot.shoulderVariation.range)}°</dd></div>
        <div><dt>Elbow source</dt><dd>{snapshot.bowArmElbowAngle.coordinateSpace ?? '--'}</dd></div>
        <div><dt>Timestamp</dt><dd>{Math.round(debug.timestampMs)} ms</dd></div>
      </dl>
    </details>
  );
}
