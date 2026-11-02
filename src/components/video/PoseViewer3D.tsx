import { useEffect, useMemo, useRef, useState } from 'react';
import { PoseScene } from '../../video-analysis/browser/poseScene3d';
import { sampleAtTime, sceneFrame, scenePose, type CameraPreset } from '../../video-analysis/pose3d';
import type { JointName, VideoAnalysisReport } from '../../video-analysis/types';

type PoseViewer3DProps = {
  report: VideoAnalysisReport;
  /** Replay time in seconds of media time. */
  time: number;
  highlight: JointName[];
};

const PRESET_LABEL: Record<CameraPreset, string> = { side: 'Side', behind: 'Behind', top: 'Top-down' };
const PRESETS = Object.keys(PRESET_LABEL) as CameraPreset[];

/** The 3D skeleton for the report's world landmarks. This module is the lazy chunk that carries three.js. */
export default function PoseViewer3D({ report, time, highlight }: PoseViewer3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PoseScene | null>(null);
  const [preset, setPreset] = useState<CameraPreset | null>('side');
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const { samples, settings } = report;
  const handedness = settings.handedness;
  const sampleTimes = useMemo(() => samples.map((sample) => sample.t), [samples]);
  const layout = useMemo(() => sceneFrame(samples, handedness), [samples, handedness]);

  // One WebGL scene per mount; closing the tab unmounts this and frees it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: PoseScene;
    try {
      scene = new PoseScene(host, layout, handedness);
    } catch (error) {
      console.error('Unable to start the 3D view:', error);
      setFailed(true);
      return;
    }
    scene.onUserMove = () => setPreset(null);
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const sync = () => scene.setReducedMotion(query?.matches ?? false);
    sync();
    query?.addEventListener('change', sync);
    sceneRef.current = scene;
    setReady(true);
    return () => {
      query?.removeEventListener('change', sync);
      sceneRef.current = null;
      setReady(false);
      scene.dispose();
    };
  }, [handedness, layout]);

  // Follow the replay: the same sample the 2D overlay would draw at this time.
  useEffect(() => {
    if (!ready) return;
    const sample = sampleAtTime(samples, sampleTimes, time);
    sceneRef.current?.showPose(sample ? scenePose(sample) : null, highlight, handedness);
  }, [handedness, highlight, ready, sampleTimes, samples, time]);

  const choose = (next: CameraPreset) => {
    setPreset(next);
    sceneRef.current?.goTo(next);
  };

  if (failed) {
    return <p className="va-viewer3d__message" role="status">The 3D view needs WebGL, which this browser or device could not start. The replay and frame readout still work.</p>;
  }

  return (
    <div className="va-viewer3d">
      <div ref={hostRef} className="va-viewer3d__canvas" role="img" aria-label="3D skeleton of the archer. Drag to orbit, scroll or pinch to zoom." />
      <div className="va-viewer3d__presets" role="group" aria-label="Camera">
        {PRESETS.map((value) => (
          <button key={value} type="button" className={preset === value ? 'is-selected' : ''} aria-pressed={preset === value} onClick={() => choose(value)}>{PRESET_LABEL[value]}</button>
        ))}
      </div>
      <span className="va-stage__chip">3D · hip-centred, metres</span>
    </div>
  );
}
