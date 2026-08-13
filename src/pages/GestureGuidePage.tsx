import { useRef, useState } from 'react';
import { CameraPreview } from '../components/CameraPreview';
import { GestureDiagram } from '../components/gestures/GestureDiagram';
import { PageHeader } from '../components/PageHeader';
import { SCORE_GESTURES } from '../gesture-entry/gestureDefinitions';
import { useGestureScoreEntry } from '../hooks/useGestureScoreEntry';
import { useLocalCamera } from '../hooks/useLocalCamera';

export function GestureGuidePage({ onBack }: { onBack?: () => void }) {
  const [practice, setPractice] = useState(false); const camera = useLocalCamera({ autoStart: practice }); const videoRef = useRef<HTMLVideoElement | null>(null);
  const gesture = useGestureScoreEntry({ videoRef, active: practice && Boolean(camera.stream), practice: true });
  return <div className="gesture-guide-page"><PageHeader title="Touchless Score Guide" subtitle="Athlete-reported scores, recognized locally" actions={<button type="button" className="gesture-guide-link" onClick={onBack}>Back to analysis</button>} />
    <section className="gesture-instructions"><span className="eyebrow">How to enter a score</span><ol><li>Finish your shot.</li><li>Wait for SHOW SCORE.</li><li>Face the camera.</li><li>Raise your hand(s).</li><li>Hold steadily.</li><li>Wait for SCORE RECORDED.</li><li>Begin your next shot.</li></ol></section>
    <section className="gesture-guide-grid">{SCORE_GESTURES.map((definition) => <article key={definition.id}><GestureDiagram score={definition.score} isX={definition.isX} /><strong>{definition.label}</strong><span>{definition.description}</span></article>)}</section>
    <section className="gesture-practice"><div><span className="eyebrow">Practice gestures</span><h2>Learn without creating a shot</h2><p>Practice never changes session scores or shot count.</p><button type="button" onClick={() => setPractice((value) => !value)}>{practice ? 'Stop Practice' : 'Start Practice'}</button></div>
      {practice ? <CameraPreview stream={camera.stream} isLoading={camera.isLoading} error={camera.error} videoRef={videoRef} className="gesture-practice__camera"><div className="gesture-practice__feedback"><strong>{gesture.candidate ? gesture.candidate.isX ? 'X' : gesture.candidate.score : '--'}</strong><span>Hands detected: {gesture.debug.handsDetected}</span><span>Left {gesture.debug.leftFingerCount ?? '--'} · Right {gesture.debug.rightFingerCount ?? '--'}</span><span>{gesture.debug.stableDurationMs >= gesture.debug.requiredHoldMs ? 'Hold quality: Stable' : gesture.debug.handsDetected === 0 ? 'Move hands closer to the camera' : 'Keep fingers separated and hold steady'}</span></div></CameraPreview> : null}
    </section>
  </div>;
}
