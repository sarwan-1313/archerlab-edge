import { useEffect, useRef, type RefObject } from 'react';
import type { AnalysisProgress, AnalysisStage } from '../../video-analysis/browser/runVideoAnalysis';
import { containRect, drawSkeleton } from '../../video-analysis/drawing';
import type { ArcherHandedness } from '../../types/biomechanics';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const STEPS: Array<{ stage: AnalysisStage; label: string }> = [
  { stage: 'audio', label: 'Listen for releases' },
  { stage: 'model', label: 'Load the pose model' },
  { stage: 'tracking', label: 'Track every frame' },
  { stage: 'refining', label: 'Precision pass at each release' },
  { stage: 'scoring', label: 'Score form and coach' },
];
const ORDER: AnalysisStage[] = ['loading', 'audio', 'model', 'tracking', 'refining', 'scoring'];

type ProcessingViewProps = {
  fileName: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  progress: AnalysisProgress | null;
  handedness: ArcherHandedness;
  onCancel: () => void;
};

export function ProcessingView({ fileName, videoRef, canvasRef, progress, handedness, onCancel }: ProcessingViewProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const percent = Math.round((progress?.fraction ?? 0) * 100);
  const activeIndex = ORDER.indexOf(progress?.stage ?? 'loading');

  // Draw the latest tracked skeleton over the frame being analysed.
  useEffect(() => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;
    const rect = overlay.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    overlay.width = Math.round(rect.width * ratio);
    overlay.height = Math.round(rect.height * ratio);
    const context = overlay.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, overlay.width, overlay.height);
    const image = progress?.sample?.image;
    if (!image) return;
    const box = containRect(overlay.width, overlay.height, video.videoWidth, video.videoHeight);
    drawSkeleton(context, image, { ...box, handedness });
  }, [progress, handedness, videoRef]);

  return (
    <section className="va-processing" aria-label="Analysing video">
      <div>
        <div className="va-stage">
          <video ref={videoRef} muted playsInline preload="auto" aria-label="Video being analysed" />
          <canvas ref={overlayRef} aria-hidden="true" />
          <span className="va-stage__chip">{progress?.stage === 'tracking' || progress?.stage === 'refining' ? `Frame by frame · ${progress.currentTime?.toFixed(1) ?? '0.0'} s` : 'Preparing'}</span>
        </div>
        <canvas ref={canvasRef} hidden />
      </div>
      <div className="va-panel va-progress" aria-live="polite">
        <span className="va-eyebrow">Analysing · {fileName}</span>
        <div className="va-progress__number">{percent}<small>%</small></div>
        <div className="va-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Analysis progress"><div style={{ width: `${percent}%` }} /></div>
        <p className="va-muted">{progress?.message ?? 'Starting…'}</p>
        <ol className="va-steps">
          {STEPS.map((step) => {
            const index = ORDER.indexOf(step.stage);
            const state = index < activeIndex ? 'is-done' : index === activeIndex ? 'is-active' : '';
            return (
              <li key={step.stage} className={state}>
                <i>{state === 'is-done' ? <AppIcon name="check" size={12} /> : null}</i>
                {step.label}
              </li>
            );
          })}
        </ol>
        {progress?.framesProcessed ? (
          <p className="va-faint">{progress.framesProcessed} frames tracked{progress.playbackRate ? ` · running at ${progress.playbackRate.toFixed(2)}× real time` : ''}</p>
        ) : null}
        <p className="va-faint"><AppIcon name="shield" size={13} /> Keep this tab open and visible. Everything runs on this device; nothing is uploaded.</p>
        <ActionButton variant="secondary" type="button" onClick={onCancel}><AppIcon name="close" size={16} /> Cancel</ActionButton>
      </div>
    </section>
  );
}
